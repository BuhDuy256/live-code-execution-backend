import { spawn, ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import type { ExecutionResult, SandboxOptions } from "../types/execution";
import { validateLanguage, getLanguageConfig } from "../utils/language.util";
import { MAX_OUTPUT_SIZE } from "../config/constants";

type TimeoutReason = "TIMEOUT" | "OUTPUT_LIMIT";

interface ExecutionState {
  stdout: string;
  stderr: string;
  killed: boolean;
  timeoutReason: TimeoutReason | null;
}

/**
 * Helper: Create temporary directory for code execution
 */
const createTempDirectory = async (): Promise<string> => {
  return await fs.mkdtemp(path.join(os.tmpdir(), "exec-"));
};

/**
 * Helper: Cleanup temporary directory
 */
const cleanupTempDirectory = async (tmpDir: string | null): Promise<void> => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
      console.error(`Failed to cleanup tmpDir: ${tmpDir}`);
    });
  }
};

/**
 * Helper: Prepare command arguments based on language
 */
const prepareCommandArgs = async (
  language: string,
  sourceCode: string,
  tmpDir: string,
  memoryLimit: number
): Promise<string[]> => {
  const langConfig = getLanguageConfig(language);

  // Python: inject memory limit wrapper and use -c to execute inline
  if (language === 'python' && 'memoryLimitWrapper' in langConfig) {
    const wrapper = (langConfig as any).memoryLimitWrapper(memoryLimit, sourceCode);
    return [...langConfig.args, wrapper];
  }

  // JavaScript/Java: write to file and use memory flags
  const filePath = path.join(tmpDir, langConfig.fileName);
  await fs.writeFile(filePath, sourceCode);
  const memoryArgs = langConfig.memoryArgs(memoryLimit);
  return [...memoryArgs, ...langConfig.args, filePath];
};

/**
 * Helper: Setup timeout handler
 */
const setupTimeout = (
  child: ChildProcess,
  state: ExecutionState,
  timeoutMs: number
): NodeJS.Timeout => {
  return setTimeout(() => {
    state.killed = true;
    state.timeoutReason = "TIMEOUT";
    child.kill('SIGKILL');
  }, timeoutMs);
};

/**
 * Helper: Handle output data (stdout or stderr)
 */
const handleOutputData = (
  child: ChildProcess,
  state: ExecutionState,
  data: Buffer,
  isStderr: boolean
): void => {
  const output = data.toString();

  if (isStderr) {
    state.stderr += output;
    if (state.stderr.length > MAX_OUTPUT_SIZE) {
      state.killed = true;
      state.timeoutReason = "OUTPUT_LIMIT";
      child.kill('SIGKILL');
    }
  } else {
    state.stdout += output;
    if (state.stdout.length > MAX_OUTPUT_SIZE) {
      state.killed = true;
      state.timeoutReason = "OUTPUT_LIMIT";
      child.kill('SIGKILL');
    }
  }
};

/**
 * Helper: Build final execution result
 */
const buildExecutionResult = (state: ExecutionState, exitCode: number | null): ExecutionResult => {
  let { stdout, stderr } = state;

  // Set stderr message based on kill reason
  if (state.killed && state.timeoutReason === "TIMEOUT") {
    stderr = "Execution timed out";
  } else if (state.killed && state.timeoutReason === "OUTPUT_LIMIT") {
    stderr = stderr || "Output size limit exceeded";
  }

  return {
    stdout: stdout.substring(0, MAX_OUTPUT_SIZE),
    stderr: stderr.substring(0, MAX_OUTPUT_SIZE),
    exitCode: state.killed ? -1 : (exitCode ?? -1),
  };
};

/**
 * Helper: Execute code in spawned process
 */
const executeProcess = async (
  command: string,
  args: string[],
  timeout: number
): Promise<ExecutionResult> => {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    const state: ExecutionState = {
      stdout: "",
      stderr: "",
      killed: false,
      timeoutReason: null,
    };

    const timer = setupTimeout(child, state, timeout);

    child.stdout.on("data", (data) => handleOutputData(child, state, data, false));
    child.stderr.on("data", (data) => handleOutputData(child, state, data, true));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(buildExecutionResult(state, code));
    });

    child.on("error", () => {
      clearTimeout(timer);
      // Always resolve, never reject - sanitize error message
      resolve({
        stdout: "",
        stderr: "Unable to execute code",
        exitCode: -1,
      });
    });
  });
};

export const runCodeInSandbox = async (
  sourceCode: string,
  language: string,
  options: SandboxOptions
): Promise<ExecutionResult> => {
  // Step 1: Validate language
  validateLanguage(language);

  let tmpDir: string | null = null;

  try {
    // Step 2: Create temporary directory
    tmpDir = await createTempDirectory();

    // Step 3: Prepare command arguments
    const memoryLimit = options.memoryLimit || 128;
    const commandArgs = await prepareCommandArgs(language, sourceCode, tmpDir, memoryLimit);
    const langConfig = getLanguageConfig(language);

    // Step 4: Execute in sandboxed process
    return await executeProcess(langConfig.command, commandArgs, options.timeout);
  } finally {
    // Step 5: Cleanup temporary directory
    await cleanupTempDirectory(tmpDir);
  }
};

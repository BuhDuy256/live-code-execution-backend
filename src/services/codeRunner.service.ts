import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import type { ExecutionResult, SandboxOptions } from "../types/execution";
import { validateLanguage } from "../utils/language.util";
import { LANGUAGE_CONFIG, MAX_OUTPUT_SIZE } from "../config/constants";

const getLanguageConfig = (language: string) => {
  const config = LANGUAGE_CONFIG[language as keyof typeof LANGUAGE_CONFIG];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return config;
};

export const runCodeInSandbox = async (
  sourceCode: string,
  language: string,
  options: SandboxOptions
): Promise<ExecutionResult> => {
  validateLanguage(language);

  let tmpDir: string | null = null;

  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "exec-"));
    const langConfig = getLanguageConfig(language);
    const filePath = path.join(tmpDir, langConfig.fileName);
    await fs.writeFile(filePath, sourceCode);

    return await new Promise((resolve) => {
      const memoryArgs = langConfig.memoryArgs(options.memoryLimit || 128);
      const child = spawn(langConfig.command, [...memoryArgs, ...langConfig.args, filePath]);

      let stdout = "";
      let stderr = "";
      let killed = false;
      let timeoutReason: string | null = null;

      // Manual timeout - spawn's timeout option doesn't work reliably
      const timer = setTimeout(() => {
        killed = true;
        timeoutReason = "TIMEOUT";
        child.kill('SIGKILL');
      }, options.timeout);

      child.stdout.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT_SIZE) {
          killed = true;
          timeoutReason = "OUTPUT_LIMIT";
          child.kill('SIGKILL');
        }
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE) {
          killed = true;
          timeoutReason = "OUTPUT_LIMIT";
          child.kill('SIGKILL');
        }
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        // Set stderr message based on kill reason
        if (killed && timeoutReason === "TIMEOUT") {
          stderr = "Execution timed out";
        } else if (killed && timeoutReason === "OUTPUT_LIMIT") {
          stderr = stderr || "Output size limit exceeded";
        }

        resolve({
          stdout: stdout.substring(0, MAX_OUTPUT_SIZE),
          stderr: stderr.substring(0, MAX_OUTPUT_SIZE),
          exitCode: killed ? -1 : (code ?? -1),
        });
      });

      child.on("error", (_err) => {
        clearTimeout(timer);
        // Always resolve, never reject in execution system
        // Sanitize error - don't expose command or path details
        resolve({
          stdout: "",
          stderr: "Unable to execute code",
          exitCode: -1,
        });
      });
    });
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        console.error(`Failed to cleanup tmpDir: ${tmpDir}`);
      });
    }
  }
};

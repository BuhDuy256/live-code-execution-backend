import type { ExecutionResult, SandboxOptions } from "../types/execution";

export const runCodeInSandbox = async (
  sourceCode: string,
  language: string,
  options: SandboxOptions
): Promise<ExecutionResult> => {
  // TODO: Implement actual sandboxed code execution
  // Mock implementation for now
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    stdout: `Mock execution output\nLanguage: ${language}\nCode length: ${sourceCode.length} chars`,
    stderr: "",
    exitCode: 0,
  };
};
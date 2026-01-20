export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

export interface SandboxOptions {
  timeout: number;
  memoryLimit: number;
}

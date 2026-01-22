import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { CodeExecutionJobData } from "../queues/codeExecution.queue";
import type { ExecutionResult } from "../types/execution";
import { WORKER_SIGNALS, WORKER_CONFIG, EXECUTION_LIMITS } from "../config/constants";
import * as ExecutionRepository from "../repositories/execution.repository";
import * as CodeRunnerService from "../services/codeRunner.service";
import { ExecutionStatus } from "../models";

/**
 * Helper: Validate job has an ID
 */
const validateJobId = (job: Job<CodeExecutionJobData>): string => {
  if (!job.id) {
    throw new Error("Job ID is missing");
  }
  return String(job.id);
};

/**
 * Helper: Mark execution as RUNNING
 */
const markExecutionAsRunning = async (executionId: string): Promise<void> => {
  await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.RUNNING);
};

/**
 * Helper: Execute code in sandbox and measure time
 */
const executeCodeInSandbox = async (sourceCode: string, language: string): Promise<{ result: ExecutionResult; executionTimeMs: number }> => {
  const startTime = Date.now();

  const result = await CodeRunnerService.runCodeInSandbox(sourceCode, language, {
    timeout: EXECUTION_LIMITS.TIMEOUT_MS,
    memoryLimit: EXECUTION_LIMITS.MEMORY_MB,
  });

  const executionTimeMs = Date.now() - startTime;

  return { result, executionTimeMs };
};

/**
 * Helper: Check if execution result indicates user code error
 */
const hasUserCodeError = (result: ExecutionResult): boolean => {
  return !!(result.stderr || (result.exitCode !== undefined && result.exitCode !== 0));
};

/**
 * Helper: Handle successful execution (no errors)
 */
const handleSuccessResult = async (executionId: string, result: ExecutionResult, executionTimeMs: number): Promise<void> => {
  await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.COMPLETED, {
    stdout: result.stdout,
    stderr: null,
    exit_code: 0,
    execution_time_ms: executionTimeMs,
  });

  console.log(`Execution ${executionId} completed successfully in ${executionTimeMs}ms`);
};

/**
 * Helper: Handle user code error (non-zero exit code or stderr)
 */
const handleUserCodeError = async (executionId: string, result: ExecutionResult, executionTimeMs: number): Promise<void> => {
  await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.FAILED, {
    stdout: result.stdout,
    stderr: result.stderr || "",
    exit_code: result.exitCode ?? 1,
    execution_time_ms: executionTimeMs,
  });

  console.log(`Execution ${executionId} failed: user code error (exit code: ${result.exitCode})`);
};

/**
 * Helper: Determine status from system error (timeout vs other errors)
 */
const determineErrorStatus = (error: any): ExecutionStatus => {
  return error?.name === "TimeoutError" ? ExecutionStatus.TIMEOUT : ExecutionStatus.FAILED;
};

/**
 * Helper: Get safe error message (never expose internal details)
 */
const getSafeErrorMessage = (status: ExecutionStatus): string => {
  return status === ExecutionStatus.TIMEOUT
    ? "Execution timed out"
    : "System error occurred during execution";
};

/**
 * Helper: Handle system errors (timeout, crashes, etc.)
 */
const handleSystemError = async (executionId: string, error: any): Promise<void> => {
  const status = determineErrorStatus(error);
  const safeErrorMessage = getSafeErrorMessage(status);

  await ExecutionRepository.updateExecutionStatus(executionId, status, {
    error_message: safeErrorMessage,
    stderr: null,
  });

  console.error(`Execution ${executionId} system error (${status}):`, error?.message);
};

/**
 * Main worker job processor
 */
const processCodeExecution = async (job: Job<CodeExecutionJobData>): Promise<ExecutionResult> => {
  // Step 1: Validate job and extract data
  const executionId = validateJobId(job);
  const { sourceCode, language } = job.data;

  try {
    // Step 2: Mark as running
    await markExecutionAsRunning(executionId);

    // Step 3: Execute code in sandbox
    const { result, executionTimeMs } = await executeCodeInSandbox(sourceCode, language);

    // Step 4: Process result based on success or user code error
    if (hasUserCodeError(result)) {
      await handleUserCodeError(executionId, result, executionTimeMs);
    } else {
      await handleSuccessResult(executionId, result, executionTimeMs);
    }

    return result;
  } catch (error: any) {
    // Step 5: Handle system errors
    await handleSystemError(executionId, error);
    throw error;
  }
};

export const codeExecutionWorker = new Worker<CodeExecutionJobData>(
  "code-execution",
  processCodeExecution,
  {
    connection: redisOptions,
    concurrency: WORKER_CONFIG.CONCURRENCY,
    limiter: {
      max: WORKER_CONFIG.RATE_LIMIT_MAX,
      duration: WORKER_CONFIG.RATE_LIMIT_DURATION_MS,
    },
    // Stalled job detection - handles worker crashes
    lockDuration: WORKER_CONFIG.STALLED_INTERVAL_MS,  // How long a job can be locked before considering it stalled
    stalledInterval: WORKER_CONFIG.STALLED_INTERVAL_MS,  // Check for stalled jobs every 30s
    maxStalledCount: WORKER_CONFIG.MAX_STALLED_COUNT,    // Mark failed after 2 stalled checks
  },
);

codeExecutionWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

codeExecutionWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

codeExecutionWorker.on("stalled", (jobId) => {
  console.warn(`Job ${jobId} stalled - worker may have crashed. BullMQ will retry automatically.`);
});

codeExecutionWorker.on("error", (err) => {
  console.error("Worker internal error:", err);
});

const shutdown = async (signal: string) => {
  console.log(`Worker received ${signal}. Shutting down gracefully...`);
  try {
    await codeExecutionWorker.close();
    console.log("Worker closed successfully");
  } catch (err) {
    console.error("Error while closing worker:", err);
  } finally {
    process.exit(0);
  }
};

WORKER_SIGNALS.forEach((signal) => {
  process.on(signal, shutdown);
});

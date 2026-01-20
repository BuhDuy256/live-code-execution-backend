import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { CodeExecutionJobData } from "../queues/codeExecution.queue";
import type { ExecutionResult } from "../types/execution";
import { WORKER_SIGNALS, WORKER_CONFIG } from "../config/constants";
import * as ExecutionRepository from "../repositories/execution.repository";
import * as CodeRunnerService from "../services/codeRunner.service";
import { ExecutionStatus } from "../models";

export const codeExecutionWorker = new Worker<CodeExecutionJobData>(
  "code-execution",
  async (job: Job<CodeExecutionJobData>): Promise<ExecutionResult> => {
    if (!job.id) {
      throw new Error("Job ID is missing");
    }

    const executionId = String(job.id);
    const { sourceCode, language } = job.data;

    try {
      await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.RUNNING);
      await job.updateProgress({ status: "RUNNING", progress: 10 });

      const startTime = Date.now();

      const result: ExecutionResult = await CodeRunnerService.runCodeInSandbox(sourceCode, language, {
        timeout: parseInt(process.env["MAX_EXECUTION_TIME_MS"] || "5000"),
        memoryLimit: parseInt(process.env["MAX_MEMORY_MB"] || "128"),
      });

      const executionTimeMs = Date.now() - startTime;

      const hasUserCodeError = result.stderr || (result.exitCode !== undefined && result.exitCode !== 0);

      if (hasUserCodeError) {
        await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.FAILED, {
          stdout: result.stdout,
          stderr: result.stderr || "",
          exit_code: result.exitCode ?? 1,
          execution_time_ms: executionTimeMs,
        });

        console.log(`Execution ${executionId} failed: user code error (exit code: ${result.exitCode})`);
      } else {
        await ExecutionRepository.updateExecutionStatus(executionId, ExecutionStatus.COMPLETED, {
          stdout: result.stdout,
          stderr: null,
          exit_code: 0,
          execution_time_ms: executionTimeMs,
        });

        console.log(`Execution ${executionId} completed successfully in ${executionTimeMs}ms`);
      }

      return result;
    } catch (error: any) {
      const isTimeout = error?.name === "TimeoutError";
      const status = isTimeout ? ExecutionStatus.TIMEOUT : ExecutionStatus.FAILED;

      await ExecutionRepository.updateExecutionStatus(executionId, status, {
        error_message: error?.message || "Unknown system error",
        stderr: null,
      });

      console.error(`Execution ${executionId} system error (${status}):`, error?.message);

      throw error;
    }
  },
  {
    connection: redisOptions,
    concurrency: Number(process.env["WORKER_CONCURRENCY"] || WORKER_CONFIG.DEFAULT_CONCURRENCY),
    limiter: {
      max: WORKER_CONFIG.RATE_LIMIT_MAX,
      duration: WORKER_CONFIG.RATE_LIMIT_DURATION_MS,
    },
  },
);

codeExecutionWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

codeExecutionWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
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

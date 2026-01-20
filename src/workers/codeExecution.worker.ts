import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { CodeExecutionJobData } from "../queues/codeExecution.queue";
import type { ExecutionResult } from "../types/execution";
import { WORKER_SIGNALS, WORKER_CONFIG } from "../config/constants";

export const codeExecutionWorker = new Worker<CodeExecutionJobData>(
  "code-execution",
  async (job: Job<CodeExecutionJobData>): Promise<ExecutionResult> => {
    if (!job.id) {
      throw new Error("Job ID is missing");
    }

    const executionId = String(job.id);
    const { sessionId, sourceCode, language } = job.data;

    try {
      // TODO: Code update status of the job to RUNNING

      await job.updateProgress({ status: "RUNNING", progress: 10 });

      const startTime = Date.now();

      // TODO: Code run code in sandboxed environment
      // Mock execution - simulate running code
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const result: ExecutionResult = {
        stdout: `Mock execution output for session ${sessionId}\nLanguage: ${language}`,
        stderr: "",
        exitCode: 0,
      };

      const executionTimeMs = Date.now() - startTime;

      // TODO: Code update status of the job to COMPLETED with results
      console.log(`Execution ${executionId} completed in ${executionTimeMs}ms`);

      return result;
    } catch (error: any) {
      const status = error?.name === "TimeoutError" ? "TIMEOUT" : "FAILED";

      // TODO: Code update status of the job to FAILED with error details

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

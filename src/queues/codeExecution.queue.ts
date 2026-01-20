import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { QUEUE_SIGNALS, QUEUE_CONFIG } from "../config/constants";

export interface CodeExecutionJobData {
  sourceCode: string;
  language: string;
  timestamp: number;
}

export const codeExecutionQueue = new Queue<CodeExecutionJobData>(
  "code-execution", // Queue Name
  {
    connection: redisOptions,
    defaultJobOptions: {
      attempts: QUEUE_CONFIG.MAX_ATTEMPTS, // Total number of attempts if worker throw an error
      backoff: {
        type: "exponential", // Exponential (2^n) backoff strategy for retries
        delay: QUEUE_CONFIG.BACKOFF_DELAY_MS, // Delay time each retry
      },
      removeOnComplete: {
        age: QUEUE_CONFIG.REMOVE_COMPLETED_AGE_SECONDS, // Time in seconds to keep completed jobs before removal
        count: QUEUE_CONFIG.REMOVE_COMPLETED_COUNT, // Maximum number of completed jobs to keep
      },
      removeOnFail: false, // Keep failed jobs for debugging
    },
  },
);

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Closing code execution queue...`);
  try {
    await codeExecutionQueue.close();
    console.log("Code execution queue closed");
  } catch (err) {
    console.error("Error closing queue:", err);
  } finally {
    process.exit(0);
  }
};

QUEUE_SIGNALS.forEach((signal) => {
  process.on(signal, shutdown);
});

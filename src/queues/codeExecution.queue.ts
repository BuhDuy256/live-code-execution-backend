import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { QUEUE_SIGNALS, QUEUE_CONFIG } from "../config/constants";

export interface CodeExecutionJobData {
  sessionId: string;
  sourceCode: string;
  language: string;
  timestamp: number;
}

export const codeExecutionQueue = new Queue<CodeExecutionJobData>(
  "code-execution",
  {
    connection: redisOptions,
    defaultJobOptions: {
      attempts: QUEUE_CONFIG.MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: QUEUE_CONFIG.BACKOFF_DELAY_MS,
      },
      removeOnComplete: {
        age: QUEUE_CONFIG.REMOVE_COMPLETED_AGE_SECONDS,
        count: QUEUE_CONFIG.REMOVE_COMPLETED_COUNT,
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

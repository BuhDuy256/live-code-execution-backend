import { codeExecutionWorker } from "./codeExecution.worker";

export const startWorkers = () => {
  console.log("Starting BullMQ workers...");
  console.log(`Code execution worker started with concurrency`);
};

// Export worker instance for external access if needed
export { codeExecutionWorker };
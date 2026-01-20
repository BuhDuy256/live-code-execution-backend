/**
 * Execution status types
 */
export type ExecutionStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT";

/**
 * Response for GET /executions/{execution_id}
 */
export interface ExecutionResultResponse {
  execution_id: string;
  status: ExecutionStatus;
  stdout?: string;
  stderr?: string;
  execution_time_ms?: number;
  created_at?: Date | string;
  completed_at?: Date | string;
}

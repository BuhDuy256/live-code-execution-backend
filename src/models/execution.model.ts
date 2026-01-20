export enum ExecutionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT'
}

export interface Execution {
  id: string;
  session_id: string;
  source_code: string;
  status: ExecutionStatus;
  stdout: string | null;
  stderr: string | null;
  exit_code: number | null;
  error_message: string | null;
  execution_time_ms: number | null;
  retry_count: number;
  max_retries: number;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

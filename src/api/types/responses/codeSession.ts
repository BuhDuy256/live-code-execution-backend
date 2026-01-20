/**
 * Response for POST /code-sessions and PATCH /code-sessions/{session_id}
 */
export interface SessionResponse {
  session_id: string;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * Response for POST /code-sessions/{session_id}/run
 */
export interface RunCodeResponse {
  execution_id: string;
  status: "QUEUED";
}

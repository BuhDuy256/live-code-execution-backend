/**
 * Response for POST /code-sessions and PATCH /code-sessions/{session_id}
 */
export interface SessionResponse {
  session_id: string;
  status: "ACTIVE" | "INACTIVE";
}

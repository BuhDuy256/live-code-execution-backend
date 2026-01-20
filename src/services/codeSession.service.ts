import { SessionResponse, RunCodeResponse } from "../api/types/responses";

export const createNewCodingSession = async (): Promise<SessionResponse> => {
  return {
    session_id: "...",
    status: "ACTIVE"
  }
}

export const updateCode = async (sessionId: string, language: string, newCode: string): Promise<SessionResponse> => {
  return {
    session_id: sessionId,
    status: "ACTIVE"
  }
}

export const executeCode = async (sessionId: string): Promise<RunCodeResponse> => {
  return {
    execution_id: "...",
    status: "QUEUED"
  }
}
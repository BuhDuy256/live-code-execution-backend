import { SessionResponse, RunCodeResponse } from "../api/types/responses";
import * as CodeSessionRepository from "../repositories/codeSession.repository";

export const createNewCodingSession = async (language: string): Promise<SessionResponse> => {
  const sessionId = crypto.randomUUID();
  await CodeSessionRepository.createCodeSession(sessionId, language);
  return {
    session_id: sessionId,
    status: "ACTIVE",
  }
}

export const updateCode = async (sessionId: string, language: string, newCode: string): Promise<SessionResponse> => {
  await CodeSessionRepository.updateCodeSession(sessionId, language, newCode);
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
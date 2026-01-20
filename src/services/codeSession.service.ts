import { SessionResponse, RunCodeResponse } from "../api/types/responses";
import * as CodeSessionRepository from "../repositories/codeSession.repository";
import * as ExecutionRepository from "../repositories/execution.repository";
import { codeExecutionQueue } from "../queues";

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
  const codeSession = await CodeSessionRepository.getCodeSessionById(sessionId);

  if (!codeSession) {
    throw new Error("Code session not found");
  }

  const executionId = crypto.randomUUID();

  await ExecutionRepository.createExecutionRecord(executionId, sessionId, codeSession.source_code);

  codeExecutionQueue.add('code-execution',
    {
      sourceCode: codeSession.source_code,
      language: codeSession.language,
      timestamp: Date.now(),
    },
    {
      jobId: executionId,
    }
  );

  return {
    execution_id: executionId,
    status: "QUEUED"
  }
}
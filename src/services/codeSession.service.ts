import { SessionResponse, RunCodeResponse } from "../api/types/responses";
import * as CodeSessionRepository from "../repositories/codeSession.repository";
import * as ExecutionRepository from "../repositories/execution.repository";
import { codeExecutionQueue } from "../queues";
import { TooManyRequestsError, ConflictError, NotFoundError } from "../errors";
import { API_RATE_LIMIT } from "../config/constants";
import { createRedisConnection } from "../config/redis";

const redis = createRedisConnection();

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
    throw new NotFoundError("Code session not found");
  }

  // Check for existing QUEUED or RUNNING execution FIRST (before rate limiting)
  const activeExecution = await ExecutionRepository.getActiveExecutionForSession(sessionId);
  if (activeExecution) {
    throw new ConflictError(
      `Execution already in progress for this session (${activeExecution.status}). Please wait for it to complete.`
    );
  }

  // Rate limiting check (only after confirming no active execution)
  const rateLimitKey = `rate-limit:${sessionId}`;
  const currentCount = await redis.incr(rateLimitKey);

  // Set expiration on first request
  if (currentCount === 1) {
    await redis.expire(rateLimitKey, 60); // 60 seconds
  }

  if (currentCount > API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    throw new TooManyRequestsError(
      `Rate limit exceeded. Maximum ${API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE} executions per minute allowed.`
    );
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
import { SessionResponse, RunCodeResponse } from "../api/types/responses";
import * as CodeSessionRepository from "../repositories/codeSession.repository";
import * as ExecutionRepository from "../repositories/execution.repository";
import { codeExecutionQueue } from "../queues";
import { TooManyRequestsError, ConflictError, NotFoundError } from "../errors";
import { API_RATE_LIMIT, AUTOSAVE_PROTECTION } from "../config/constants";
import { createRedisConnection } from "../config/redis";

const redis = createRedisConnection();

const pendingAutosaves = new Map<string, { code: string, language: string, timeoutHandle: NodeJS.Timeout }>();
const lastWriteTime = new Map<string, number>();

export const createNewCodingSession = async (language: string): Promise<SessionResponse> => {
  const sessionId = crypto.randomUUID();
  await CodeSessionRepository.createCodeSession(sessionId, language);
  return {
    session_id: sessionId,
    status: "ACTIVE",
  }
}

export const updateCode = async (sessionId: string, language: string, newCode: string): Promise<SessionResponse> => {
  const existingSession = await CodeSessionRepository.getCodeSessionById(sessionId);
  if (!existingSession) {
    throw new NotFoundError("Code session not found");
  }

  if (existingSession.source_code === newCode && existingSession.language === language) {
    return {
      session_id: sessionId,
      status: "ACTIVE"
    };
  }

  const now = Date.now();
  const lastWrite = lastWriteTime.get(sessionId) || 0;
  const timeSinceLastWrite = now - lastWrite;

  if (timeSinceLastWrite >= AUTOSAVE_PROTECTION.THROTTLE_MS) {
    const pending = pendingAutosaves.get(sessionId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      pendingAutosaves.delete(sessionId);
    }

    await CodeSessionRepository.updateCodeSession(sessionId, language, newCode);
    lastWriteTime.set(sessionId, now);
    return {
      session_id: sessionId,
      status: "ACTIVE"
    };
  }

  const pending = pendingAutosaves.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeoutHandle);
  }

  const timeoutHandle = setTimeout(async () => {
    try {
      await CodeSessionRepository.updateCodeSession(sessionId, language, newCode);
      lastWriteTime.set(sessionId, Date.now());
      pendingAutosaves.delete(sessionId);
    } catch (error) {
      console.error(`Failed to execute pending autosave for session ${sessionId}:`, error);
      pendingAutosaves.delete(sessionId);
    }
  }, AUTOSAVE_PROTECTION.THROTTLE_MS - timeSinceLastWrite);

  pendingAutosaves.set(sessionId, { code: newCode, language, timeoutHandle });

  return {
    session_id: sessionId,
    status: "ACTIVE"
  };
}

export const executeCode = async (sessionId: string): Promise<RunCodeResponse> => {
  const codeSession = await CodeSessionRepository.getCodeSessionById(sessionId);

  if (!codeSession) {
    throw new NotFoundError("Code session not found");
  }

  const activeExecution = await ExecutionRepository.getActiveExecutionForSession(sessionId);
  if (activeExecution) {
    throw new ConflictError(
      `Execution already in progress for this session (${activeExecution.status}). Please wait for it to complete.`
    );
  }

  const cooldownKey = `cooldown:${sessionId}`;
  const lastExecutionTime = await redis.get(cooldownKey);
  if (lastExecutionTime) {
    const timeElapsed = Date.now() - parseInt(lastExecutionTime, 10);
    const timeRemaining = API_RATE_LIMIT.COOLDOWN_BETWEEN_RUNS_MS - timeElapsed;
    if (timeRemaining > 0) {
      throw new TooManyRequestsError(
        `Please wait ${Math.ceil(timeRemaining / 1000)}s before running code again.`
      );
    }
  }

  const rateLimitKey = `rate-limit:${sessionId}`;
  const currentCount = await redis.incr(rateLimitKey);

  if (currentCount === 1) {
    await redis.expire(rateLimitKey, 60);
  }

  if (currentCount > API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    throw new TooManyRequestsError(
      `Rate limit exceeded. Maximum ${API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE} executions per minute allowed.`
    );
  }

  const executionId = crypto.randomUUID();

  try {
    await ExecutionRepository.createExecutionRecord(executionId, sessionId, codeSession.source_code);
  } catch (error: any) {
    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    if (errorCode === 'SQLITE_CONSTRAINT' ||
      errorCode.includes('SQLITE_CONSTRAINT') ||
      error.errno === 19 ||
      errorMessage.includes('UNIQUE constraint failed') ||
      errorMessage.includes('SQLITE_CONSTRAINT')) {
      throw new ConflictError(
        'Execution already in progress for this session. Please wait for it to complete.'
      );
    }

    throw error;
  }

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

  await redis.set(
    cooldownKey,
    Date.now().toString(),
    'EX',
    Math.ceil(API_RATE_LIMIT.COOLDOWN_BETWEEN_RUNS_MS / 1000)
  );

  return {
    execution_id: executionId,
    status: "QUEUED"
  }
}

import { SessionResponse, RunCodeResponse } from "../api/types/responses";
import * as CodeSessionRepository from "../repositories/codeSession.repository";
import * as ExecutionRepository from "../repositories/execution.repository";
import { codeExecutionQueue } from "../queues";
import { TooManyRequestsError, ConflictError, NotFoundError, ForbiddenError } from "../errors";
import { API_RATE_LIMIT, AUTOSAVE_PROTECTION } from "../config/constants";
import { redisConnection } from "../config/redis";

const pendingAutosaves = new Map<string, { code: string, language: string, timeoutHandle: NodeJS.Timeout, firstPendingAt: number }>();
const lastWriteTime = new Map<string, number>();

export const createNewCodingSession = async (language: string): Promise<SessionResponse> => {
  const sessionId = crypto.randomUUID();
  await CodeSessionRepository.createCodeSession(sessionId, language);
  return {
    session_id: sessionId,
    status: "ACTIVE",
  }
}

export const closeSession = async (sessionId: string): Promise<SessionResponse> => {
  const existingSession = await CodeSessionRepository.getCodeSessionById(sessionId);
  if (!existingSession) {
    throw new NotFoundError("Code session not found");
  }

  await CodeSessionRepository.closeCodeSession(sessionId);

  return {
    session_id: sessionId,
    status: "INACTIVE",
  };
};


/**
 * Helper: Cancel any pending autosave for a session
 */
const cancelPendingAutosave = (sessionId: string): void => {
  const pending = pendingAutosaves.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeoutHandle);
    pendingAutosaves.delete(sessionId);
  }
};

/**
 * Helper: Execute DB write and update tracking state
 */
const executeWrite = async (sessionId: string, language: string, code: string): Promise<void> => {
  await CodeSessionRepository.updateCodeSession(sessionId, language, code);
  lastWriteTime.set(sessionId, Date.now());
  cancelPendingAutosave(sessionId);
};

/**
 * Helper: Write immediately (when throttle period has passed)
 */
const handleImmediateWrite = async (sessionId: string, language: string, code: string): Promise<SessionResponse> => {
  cancelPendingAutosave(sessionId);
  await executeWrite(sessionId, language, code);
  return { session_id: sessionId, status: "ACTIVE" };
};

/**
 * Helper: Force write when pending autosave has been delayed too long
 */
const handleForcedWrite = async (sessionId: string, language: string, code: string): Promise<SessionResponse> => {
  cancelPendingAutosave(sessionId);
  try {
    await executeWrite(sessionId, language, code);
  } catch (error) {
    console.error(`Failed to execute forced autosave for session ${sessionId}:`, error);
  }
  return { session_id: sessionId, status: "ACTIVE" };
};

/**
 * Helper: Schedule a delayed autosave
 */
const schedulePendingAutosave = (sessionId: string, language: string, code: string, delay: number, firstPendingAt: number): void => {
  const timeoutHandle = setTimeout(async () => {
    try {
      await executeWrite(sessionId, language, code);
    } catch (error) {
      console.error(`Failed to execute pending autosave for session ${sessionId}:`, error);
      pendingAutosaves.delete(sessionId);
    }
  }, delay);

  pendingAutosaves.set(sessionId, { code, language, timeoutHandle, firstPendingAt });
};

/**
 * Autosave logic:
 * - If time since last DB write >= THROTTLE_MS → save to DB immediately.
 * - If < THROTTLE_MS → cancel previous pending autosave (if any) and
 *   schedule a new autosave with the latest code.
 * - If a pending autosave has been delayed > PENDING_TIMEOUT_MS (In case FE don't stop calling API) → force write to DB.
 */
export const updateCode = async (sessionId: string, language: string, newCode: string): Promise<SessionResponse> => {
  // Validate session exists
  const existingSession = await CodeSessionRepository.getCodeSessionById(sessionId);
  if (!existingSession) {
    throw new NotFoundError("Code session not found");
  }

  // No changes, return early
  if (existingSession.source_code === newCode && existingSession.language === language) {
    return { session_id: sessionId, status: "ACTIVE" };
  }

  const now = Date.now();
  const lastWrite = lastWriteTime.get(sessionId) || 0;
  const timeSinceLastWrite = now - lastWrite;

  // Case 1: Throttle period has passed → write immediately
  if (timeSinceLastWrite >= AUTOSAVE_PROTECTION.THROTTLE_MS) {
    return await handleImmediateWrite(sessionId, language, newCode);
  }

  // Case 2: Check if pending autosave has been delayed too long → force write
  const pending = pendingAutosaves.get(sessionId);
  if (pending) {
    const pendingDuration = now - pending.firstPendingAt;
    if (pendingDuration >= AUTOSAVE_PROTECTION.PENDING_TIMEOUT_MS) {
      return await handleForcedWrite(sessionId, language, newCode);
    }
    // Cancel the old pending autosave
    clearTimeout(pending.timeoutHandle);
  }

  // Case 3: Schedule a new pending autosave
  const delay = AUTOSAVE_PROTECTION.THROTTLE_MS - timeSinceLastWrite;
  const firstPendingAt = pending?.firstPendingAt ?? now;
  schedulePendingAutosave(sessionId, language, newCode, delay, firstPendingAt);

  return { session_id: sessionId, status: "ACTIVE" };
};

/**
 * Helper: Validate session exists, is active, and has no running execution
 */
const validateSessionForExecution = async (sessionId: string) => {
  const codeSession = await CodeSessionRepository.getCodeSessionById(sessionId);

  if (!codeSession) {
    throw new NotFoundError("Code session not found");
  }

  if (codeSession.status !== 'ACTIVE') {
    throw new ForbiddenError("Cannot execute code in an inactive session");
  }

  const activeExecution = await ExecutionRepository.getActiveExecutionForSession(sessionId);
  if (activeExecution) {
    throw new ConflictError(
      `Execution already in progress for this session (${activeExecution.status}). Please wait for it to complete.`
    );
  }

  return codeSession;
};

/**
 * Helper: Check cooldown period between executions
 */
const checkCooldown = async (sessionId: string): Promise<void> => {
  const cooldownKey = `cooldown:${sessionId}`;
  const lastExecutionTime = await redisConnection.get(cooldownKey);

  if (lastExecutionTime) {
    const timeElapsed = Date.now() - parseInt(lastExecutionTime, 10);
    const timeRemaining = API_RATE_LIMIT.COOLDOWN_BETWEEN_RUNS_MS - timeElapsed;

    if (timeRemaining > 0) {
      throw new TooManyRequestsError(
        `Please wait ${Math.ceil(timeRemaining / 1000)}s before running code again.`
      );
    }
  }
};

/**
 * Helper: Check rate limit (max executions per minute)
 */
const checkRateLimit = async (sessionId: string): Promise<void> => {
  const rateLimitKey = `rate-limit:${sessionId}`;
  const currentCount = await redisConnection.incr(rateLimitKey);

  if (currentCount === 1) {
    await redisConnection.expire(rateLimitKey, 60);
  }

  if (currentCount > API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    throw new TooManyRequestsError(
      `Rate limit exceeded. Maximum ${API_RATE_LIMIT.MAX_REQUESTS_PER_MINUTE} executions per minute allowed.`
    );
  }
};

/**
 * Helper: Check if error is SQLite constraint error (duplicate execution)
 */
const isSQLiteConstraintError = (error: any): boolean => {
  const errorMessage = error.message || '';
  const errorCode = error.code || '';

  return (
    errorCode === 'SQLITE_CONSTRAINT' ||
    errorCode.includes('SQLITE_CONSTRAINT') ||
    error.errno === 19 ||
    errorMessage.includes('UNIQUE constraint failed') ||
    errorMessage.includes('SQLITE_CONSTRAINT')
  );
};

/**
 * Helper: Create execution record with duplicate detection
 */
const createExecutionRecord = async (executionId: string, sessionId: string, sourceCode: string): Promise<void> => {
  try {
    await ExecutionRepository.createExecutionRecord(executionId, sessionId, sourceCode);
  } catch (error: any) {
    if (isSQLiteConstraintError(error)) {
      throw new ConflictError(
        'Execution already in progress for this session. Please wait for it to complete.'
      );
    }
    throw error;
  }
};

/**
 * Helper: Add execution to queue and set cooldown
 */
const enqueueExecution = async (executionId: string, sessionId: string, sourceCode: string, language: string): Promise<void> => {
  codeExecutionQueue.add('code-execution',
    {
      sourceCode,
      language,
      timestamp: Date.now(),
    },
    {
      jobId: executionId,
    }
  );

  const cooldownKey = `cooldown:${sessionId}`;
  await redisConnection.set(
    cooldownKey,
    Date.now().toString(),
    'EX',
    Math.ceil(API_RATE_LIMIT.COOLDOWN_BETWEEN_RUNS_MS / 1000)
  );
};

export const executeCode = async (sessionId: string): Promise<RunCodeResponse> => {
  // Step 1: Validate session and check for active execution
  const codeSession = await validateSessionForExecution(sessionId);

  // Step 2: Enforce rate limits
  await checkCooldown(sessionId);
  await checkRateLimit(sessionId);

  // Step 3: Create execution record
  const executionId = crypto.randomUUID();
  await createExecutionRecord(executionId, sessionId, codeSession.source_code);

  // Step 4: Enqueue execution and set cooldown
  await enqueueExecution(executionId, sessionId, codeSession.source_code, codeSession.language);

  return {
    execution_id: executionId,
    status: "QUEUED"
  };
};
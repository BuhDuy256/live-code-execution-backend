import db from '../config/database';
import { Execution, ExecutionStatus } from '../models';

export const getExecutionResult = async (executionId: string): Promise<Execution | undefined> => {
  const execution = await db('executions').where({ id: executionId }).first();
  return execution;
}

export const createExecutionRecord = async (executionId: string, sessionId: string, sourceCode: string) => {
  await db('executions').insert({
    id: executionId,
    session_id: sessionId,
    source_code: sourceCode,
    status: ExecutionStatus.QUEUED,
  });
}

export const updateExecutionStatus = async (executionId: string, status: ExecutionStatus, additionalData?: Partial<Execution>) => {
  const updateData: any = {
    status,
    ...additionalData,
  };

  if (status === ExecutionStatus.RUNNING) {
    updateData.started_at = new Date().toISOString();
  } else if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED || status === ExecutionStatus.TIMEOUT) {
    updateData.completed_at = new Date().toISOString();
  }

  await db('executions').where({ id: executionId }).update(updateData);
}
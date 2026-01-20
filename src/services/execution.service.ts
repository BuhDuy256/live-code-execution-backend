import { ExecutionStatus, ExecutionResultResponse } from '../api/types/responses/execution';
import * as ExecutionRepository from '../repositories/execution.repository';
import { NotFoundError } from '../errors';

export const getExecutionResult = async (executionId: string): Promise<ExecutionResultResponse> => {
  const result = await ExecutionRepository.getExecutionResult(executionId);

  if (!result) {
    throw new NotFoundError(`Execution with ID ${executionId} not found`);
  }

  return {
    execution_id: result.id,
    status: result.status as ExecutionStatus,
    stdout: result.stdout ?? undefined,
    stderr: result.stderr ?? undefined,
    execution_time_ms: result.execution_time_ms ?? undefined,
  };
};
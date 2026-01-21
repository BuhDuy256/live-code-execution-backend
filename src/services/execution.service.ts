import { ExecutionStatus, ExecutionResultResponse } from '../api/types/responses/execution';
import * as ExecutionRepository from '../repositories/execution.repository';
import { NotFoundError } from '../errors';

export const getExecutionResult = async (executionId: string): Promise<ExecutionResultResponse> => {
  const result = await ExecutionRepository.getExecutionResult(executionId);

  if (!result) {
    throw new NotFoundError(`Execution with ID ${executionId} not found`);
  }

  // Always include stdout/stderr as strings (empty if null) for COMPLETED/FAILED/TIMEOUT status
  const response: ExecutionResultResponse = {
    execution_id: result.id,
    status: result.status as ExecutionStatus,
  };

  // Include execution details for completed/failed/timeout executions
  if (result.status === 'COMPLETED' || result.status === 'FAILED' || result.status === 'TIMEOUT') {
    response.stdout = result.stdout ?? '';
    response.stderr = result.stderr ?? '';
    response.execution_time_ms = result.execution_time_ms ?? 0;
  }

  return response;
};
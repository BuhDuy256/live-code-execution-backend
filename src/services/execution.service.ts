import { ExecutionStatus, ExecutionResultResponse } from '../api/types/responses/execution';
import * as ExecutionRepository from '../repositories/execution.repository';

export const getExecutionResult = async (executionId: string): Promise<ExecutionResultResponse> => {
  const result = await ExecutionRepository.getExecutionResult(executionId);

  return {
    "execution_id": result.id,
    "status": result.status as ExecutionStatus,
    "stdout": result.stdout,
    "stderr": result.stderr,
    "execution_time_ms": result.execution_time_ms,
  }
}
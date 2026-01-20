import { ExecutionStatus, ExecutionResultResponse } from '../api/types/responses/execution';

export const getExecutionResult = async (executionId: string): Promise<ExecutionResultResponse> => {


  return {
    "execution_id": executionId,
    "status": "COMPLETED",
    "stdout": "Hello, World!\n",
    "stderr": "",
    "execution_time_ms": 123,
  }
}
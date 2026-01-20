import db from '../config/database';

export const getExecutionResult = async (executionId: string) => {
  const execution = await db('executions').where({ id: executionId }).first();
  return execution;
}
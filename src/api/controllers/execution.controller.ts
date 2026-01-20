import { Request, Response, NextFunction } from 'express';
import * as ExecutionService from '../../services/execution.service';
import { ExecutionIdParams } from '../types/requests/execution';

export const getExecutionStatus = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  try {
    const { execution_id } = request.params as unknown as ExecutionIdParams;

    const result = await ExecutionService.getExecutionResult(execution_id);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
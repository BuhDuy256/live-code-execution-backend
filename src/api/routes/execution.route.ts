import { Router } from 'express';
import { getExecutionStatus } from '../controllers/execution.controller';
import { validate } from '../middlewares/validate.middleware';
import { executionIdParamsSchema } from '../types/requests';

const router = Router();

// GET /executions/:execution_id - Retrieve execution status and result 
router.get(
  "/:execution_id",
  validate(executionIdParamsSchema, 'params'),
  getExecutionStatus
);

export { router as executionRouter };
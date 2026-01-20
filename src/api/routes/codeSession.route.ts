import { Router } from 'express';
import { createCodingSession, updateCodingSession, executeCodeInSession } from '../controllers/codeSession.controller';
import { validate } from '../middlewares/validate.middleware';
import { patchSessionBodySchema, sessionIdParamsSchema } from '../types/requests';

const router = Router();

// POST /code-sessions - Create a new live coding session & Initialize language, template code, and environment
router.post(
  "/",
  createCodingSession
);

// PATCH /code-sessions/:session_id - Autosave the learner’s current source code & Called frequently during live editing
router.patch(
  "/:session_id",
  validate(sessionIdParamsSchema, 'params'),
  validate(patchSessionBodySchema, 'body'),
  updateCodingSession
);

// POST /code-sessions/:session_id/run - Execute the current code asynchronously &  Must return immediately
router.post(
  "/:session_id/run",
  validate(sessionIdParamsSchema, 'params'),
  executeCodeInSession
);

export { router as codeSessionRouter };
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "../../../config/constants";

/**
 * Request schema for POST /code-sessions
 */
export const createSessionBodySchema = z.object({
  language: z.enum(['javascript', 'python', 'java'] as const, {
    message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`
  }),
});

/**
 * Request schema for PATCH /code-sessions/{session_id}
 */
export const patchSessionBodySchema = z.object({
  language: z.enum(['javascript', 'python', 'java'] as const, {
    message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`
  }),
  source_code: z.string().optional().default(""),
});

export const sessionIdParamsSchema = z.object({
  session_id: z.string().uuid("Invalid session ID format"),
});

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type PatchSessionBody = z.infer<typeof patchSessionBodySchema>;
export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>;

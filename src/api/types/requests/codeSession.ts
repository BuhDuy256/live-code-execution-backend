import { z } from "zod";

/**
 * Request schema for POST /code-sessions
 */
export const createSessionBodySchema = z.object({
  language: z.string().min(1, "Language is required"),
});

/**
 * Request schema for PATCH /code-sessions/{session_id}
 */
export const patchSessionBodySchema = z.object({
  language: z.string().min(1, "Language is required"),
  source_code: z.string().optional().default(""),
});

export const sessionIdParamsSchema = z.object({
  session_id: z.string().uuid("Invalid session ID format"),
});

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type PatchSessionBody = z.infer<typeof patchSessionBodySchema>;
export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>;

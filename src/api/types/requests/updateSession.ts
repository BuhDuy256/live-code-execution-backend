import { z } from "zod";

/**
 * Request schema for PATCH /code-sessions/{session_id}
 */
export const updateSessionSchema = z.object({
  language: z.string().min(1).optional(),
  source_code: z.string().min(1, "Source code is required"),
});

export type UpdateSessionRequest = z.infer<typeof updateSessionSchema>;

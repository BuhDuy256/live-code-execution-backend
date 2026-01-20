import { z } from "zod";

/**
 * Request schema for GET /executions/{execution_id}
 */
export const executionIdParamsSchema = z.object({
  execution_id: z.string().uuid("Invalid execution ID format"),
});

export type ExecutionIdParams = z.infer<typeof executionIdParamsSchema>;
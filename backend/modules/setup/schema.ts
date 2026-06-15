import { z } from 'zod';

// Body for PUT /setup. Both fields optional so the loop can persist them independently
// (declaredStudentCount as soon as the chat learns it; setupComplete when the loop finishes).
export const setupBodySchema = z
  .object({
    declaredStudentCount: z.number().int().min(1).max(12).optional(),
    setupComplete: z.boolean().optional(),
  })
  .strict();

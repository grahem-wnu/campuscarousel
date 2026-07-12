// Input validation for the student roster endpoints (multi-student per family).

import { z } from '../../shared/api/index.js';

const gradYear = z.number().int().min(2000).max(2100);

export const createStudentSchema = z
  .object({
    name: z.string().min(1).max(120),
    graduationYear: gradYear.optional(),
  })
  .strict();

export const updateStudentSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    graduationYear: gradYear.optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export const studentParamSchema = z.object({ studentId: z.string().min(1).max(64) }).strict();

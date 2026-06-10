// Input validation for the Financial Aid Center (v2.1 Module 19). `.strict()` rejects unknown fields.

import { z } from '../../shared/api/index.js';

const kind = z.enum([
  'fafsa',
  'css-profile',
  'state-aid',
  'institutional-aid',
  'loan',
  'award-letter',
  'other',
]);

const status = z.enum(['not-started', 'in-progress', 'submitted', 'received', 'n/a']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSchema = z
  .object({
    kind,
    title: z.string().min(1).max(200),
    relatedCollegeId: z.string().max(200).optional(),
    openDate: isoDate.optional(),
    deadline: isoDate.optional(),
    priorityDeadline: isoDate.optional(),
    status: status.optional(),
    amountOffered: z.number().min(0).optional(),
    amountAccepted: z.number().min(0).optional(),
    documentId: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const updateSchema = createSchema.partial();

export const seedSchema = z.object({ classYear: z.number().int().min(2000).max(2100) }).strict();

export const listQuerySchema = z
  .object({
    kind: kind.optional(),
    status: status.optional(),
    relatedCollegeId: z.string().max(200).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) }).strict();

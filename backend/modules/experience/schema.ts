// Request validation for the Experience Hours endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/**
 * Body for POST /experience. `.strict()` rejects unknown fields so typos surface as 422.
 * `hours` is required (a experience-hours entry without hours is meaningless); `visibility` is only
 * honoured for the student — enforced in the handler off the JWT, never trusted from the client.
 */
export const createSchema = z
  .object({
    date: isoDate,
    facility: z.string().min(1, 'facility is required').max(200),
    department: z.string().max(120).optional(),
    supervisorName: z.string().max(200).optional(),
    supervisorTitle: z.string().max(120).optional(),
    supervisorContact: z.string().max(200).optional(),
    hours: z.number().nonnegative().max(100000),
    duties: z.array(z.string().min(1).max(200)).max(100).optional(),
    patientInteraction: z.boolean().optional(),
    reflection: z.string().max(20000).optional(),
    // Only Keira (student role) may set `private`; enforced in the handler off the JWT.
    visibility: z.enum(['family', 'private']).optional(),
    linkedActivityId: z.string().min(1).max(200).optional(),
  })
  .strict();

/** Body for PUT /experience/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** Query for GET /experience — unknown params are ignored (API Gateway may add some). */
export const listQuerySchema = z.object({
  facility: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** Body for POST /experience/export — all optional filters plus an optional student name for the header. */
export const exportSchema = z
  .object({
    facility: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    studentName: z.string().min(1).max(200).optional(),
  })
  .strict();

/** Path params for the by-id routes. */
export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type ExportInput = z.infer<typeof exportSchema>;

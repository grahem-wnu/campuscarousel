// Request validation for the Campus Visit Planner endpoints. Every handler validates input with one
// of these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.
// Visits are family-visible (no `visibility` field), so there is no privacy rule here.

import { z } from '../../shared/api/index.js';

export const VISIT_TYPES = [
  'campus-tour',
  'department-visit',
  'open-house',
  'admitted-student-day',
  'overnight',
  'virtual',
] as const;

export const WOULD_ATTEND = ['yes', 'no', 'maybe', 'undecided'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const questionItem = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().max(2000).optional(),
  askedTo: z.string().max(200).optional(),
});

/** Body for POST /colleges/:id/visits. `.strict()` rejects unknown fields so typos surface as 422.
 *  `createdBy` is NOT accepted from the client — the handler stamps it from the JWT. */
export const createSchema = z
  .object({
    date: isoDate,
    visitType: z.enum(VISIT_TYPES).optional(),
    attendees: z.array(z.string().min(1).max(120)).max(50).optional(),
    questionsToAsk: z.array(questionItem).max(100).optional(),
    impressions: z.string().max(10000).optional(),
    pros: z.array(z.string().min(1).max(500)).max(50).optional(),
    cons: z.array(z.string().min(1).max(500)).max(50).optional(),
    photos: z.array(z.string().min(1).max(2000)).max(50).optional(),
    wouldAttend: z.enum(WOULD_ATTEND).optional(),
    travelCost: z.number().nonnegative().max(1_000_000).optional(),
  })
  .strict();

/** Body for PUT /colleges/:id/visits/:vid — every field optional (e.g. add the post-visit debrief). */
export const updateSchema = createSchema.partial();

/** Path params. */
export const collegeParamSchema = z.object({ id: z.string().min(1) });
export const visitParamSchema = z.object({ id: z.string().min(1), vid: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;

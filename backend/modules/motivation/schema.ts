// Request validation for the "Why Nursing" endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

/**
 * Motivation categories. Mirrors the data-layer `Motivation['category']` union (the frozen
 * domain type carries `experience` in addition to the five named in the module spec) so any value
 * that validates here is assignable to the stored entity.
 */
export const CATEGORIES = [
  'moment',
  'realization',
  'conversation',
  'observation',
  'experience',
  'inspiration',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** Body for POST /motivations. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    date: isoDate,
    title: z.string().min(1, 'title is required').max(200),
    // "no length limit" per the spec — capped generously to bound a single DynamoDB item.
    content: z.string().min(1, 'content is required').max(40000),
    category: z.enum(CATEGORIES).optional(),
    linkedActivityId: z.string().min(1).max(200).optional(),
    linkedClinicalId: z.string().min(1).max(200).optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
    // Only Keira (student role) may set `private`; enforced in the handler off the JWT.
    visibility: z.enum(['family', 'private']).optional(),
  })
  .strict();

/** Body for PUT /motivations/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** Query for GET /motivations — unknown params are ignored (API Gateway may add some). */
export const listQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** Path params for the by-id routes. */
export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

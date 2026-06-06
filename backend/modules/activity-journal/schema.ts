// Request validation for the Activity Journal endpoints. Every handler validates input with one
// of these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

/** Activity categories, mirroring the data-layer `ActivityCategory` union. */
export const CATEGORIES = [
  'volunteer',
  'clinical',
  'academic',
  'athletic',
  'leadership',
  'personal',
  'work',
  'award',
  'other',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** Body for POST /activities. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    date: isoDate,
    category: z.enum(CATEGORIES),
    title: z.string().min(1, 'title is required').max(200),
    subcategory: z.string().max(120).optional(),
    description: z.string().max(10000).optional(),
    hours: z.number().nonnegative().max(100000).optional(),
    reflection: z.string().max(20000).optional(),
    // Only Keira (student role) may set `private`; enforced in the handler off the JWT.
    visibility: z.enum(['family', 'private']).optional(),
    tags: z.array(z.string().min(1).max(60)).max(50).optional(),
    linkedColleges: z.array(z.string().min(1)).max(200).optional(),
  })
  .strict();

/** Body for PUT /activities/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** Query for GET /activities — unknown params are ignored (API Gateway may add some). */
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

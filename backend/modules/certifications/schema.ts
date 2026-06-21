// Request validation for the Certifications endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

/** All certification lifecycle states (mirrors the data-layer `Certification['status']` union).
 *  Used for the list FILTER, which matches on the read-time effective status. */
export const CERT_STATUSES = [
  'planned',
  'in-progress',
  'active',
  'expiring-soon',
  'expired',
  'renewed',
] as const;

/** States a caller may WRITE. `expiring-soon` / `expired` are purely DERIVED from the expiration
 *  date at read time (see status.ts), so accepting them on write would let a stored value go stale
 *  and never reconcile — they are intentionally excluded from create/update. */
export const WRITABLE_CERT_STATUSES = ['planned', 'in-progress', 'active', 'renewed'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** Body for POST /certifications. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(200),
    issuingOrganization: z.string().max(200).optional(),
    certificationNumber: z.string().max(200).optional(),
    dateEarned: isoDate.optional(),
    // `null` clears the expiration (a non-expiring cert); a string sets it.
    expirationDate: isoDate.nullable().optional(),
    renewalRequired: z.boolean().optional(),
    renewalFrequency: z.string().max(120).optional(),
    renewalRequirements: z.string().max(5000).optional(),
    status: z.enum(WRITABLE_CERT_STATUSES).optional(),
    trainingProgram: z.string().max(200).optional(),
    trainingHours: z.number().nonnegative().max(100000).optional(),
    cost: z.number().nonnegative().max(1000000).optional(),
    documentUrl: z.string().url('must be a valid URL').max(2000).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strict();

/** Body for PUT /certifications/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** Query for GET /certifications — optional status filter. Unknown params are ignored. */
export const listQuerySchema = z.object({
  status: z.enum(CERT_STATUSES).optional(),
});

/** Query for GET /certifications/expiring — window in days (default 90, the spec's alert horizon). */
export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(3650).optional(),
});

/** Body for POST /certifications/suggest — optional explicit career goal override. */
export const suggestSchema = z
  .object({
    careerGoal: z.string().min(1).max(500).optional(),
  })
  .strict();

/** Path params for the by-id routes. */
export const idParamSchema = z.object({ id: z.string().min(1) });

/** Body for POST /certifications/guidance — the cert to research "how & where to get it" for. */
export const guidanceSchema = z
  .object({
    certName: z.string().min(1).max(200),
  })
  .strict();

/** Path params for GET /certifications/guidance/:jobId (polling a guidance job). */
export const guidanceJobParamSchema = z.object({ jobId: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;
export type SuggestInput = z.infer<typeof suggestSchema>;

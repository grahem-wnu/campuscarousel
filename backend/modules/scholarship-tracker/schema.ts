// Request validation for the Scholarship Tracker endpoints. Every handler validates input with one
// of these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.
// Scholarships are family-visible (specs/modules/scholarship-tracker.md "Privacy") — no `visibility`
// field, no private-entry rule.

import { z } from '../../shared/api/index.js';

/** Scholarship types — mirrors the data-layer `Scholarship['type']` union. */
export const TYPES = [
  'merit',
  'need-based',
  'nursing-specific',
  'community-service',
  'diversity',
  'state-specific',
  'organization',
  'other',
] as const;

/** Application lifecycle — mirrors the data-layer `Scholarship['status']` union. */
export const STATUSES = [
  'discovered',
  'researching',
  'preparing',
  'applied',
  'awarded',
  'denied',
  'expired',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');
const url = z.string().url('must be a URL').max(2000);

/** Body for POST /scholarships. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(300),
    provider: z.string().max(300).optional(),
    amount: z.number().nonnegative().max(10_000_000).optional(),
    amountDescription: z.string().max(300).optional(),
    type: z.enum(TYPES).optional(),
    eligibility: z.array(z.string().min(1).max(500)).max(100).optional(),
    applicationDeadline: isoDate.optional(),
    applicationUrl: url.optional(),
    requiredMaterials: z.array(z.string().min(1).max(300)).max(100).optional(),
    linkedColleges: z.array(z.string().min(1)).max(200).optional(),
    isRenewable: z.boolean().optional(),
    renewalRequirements: z.string().max(2000).optional(),
    status: z.enum(STATUSES).optional(),
    awardedAmount: z.number().nonnegative().max(10_000_000).optional(),
    notes: z.string().max(20_000).optional(),
  })
  .strict();

/** Body for PUT /scholarships/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** Query for GET /scholarships — filters. Unknown params ignored (API Gateway may add some). */
export const listQuerySchema = z.object({
  type: z.enum(TYPES).optional(),
  status: z.enum(STATUSES).optional(),
  linkedCollege: z.string().min(1).optional(),
  /** Only scholarships whose deadline is on or before this date. */
  deadlineBefore: isoDate.optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

/** Body for POST /scholarships/discover — the search context the AI shapes results around. */
export const discoverSchema = z
  .object({
    query: z.string().max(500).optional(),
    type: z.enum(TYPES).optional(),
    state: z.string().max(60).optional(),
    linkedColleges: z.array(z.string().min(1).max(300)).max(50).optional(),
    count: z.number().int().min(1).max(20).optional(),
  })
  .strict();

/** Body for POST /scholarships/bulk-add — a selected set of discovered scholarships to save. */
export const bulkAddSchema = z
  .object({
    scholarships: z.array(createSchema).min(1, 'at least one scholarship is required').max(50),
    /** Enqueue AI hydration for each saved scholarship (async). */
    hydrate: z.boolean().optional(),
  })
  .strict();

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type DiscoverInput = z.infer<typeof discoverSchema>;
export type BulkAddInput = z.infer<typeof bulkAddSchema>;

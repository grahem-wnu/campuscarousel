// Request validation for the Goal Tracker endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.
// Goals are family-visible (specs/modules/goal-tracker.md "Privacy") — there is no `visibility`
// field and no private-entry rule here.

import { z } from '../../shared/api/index.js';

/** Goal categories — mirrors the data-layer `Goal['category']` union. */
export const CATEGORIES = [
  'academic',
  'clinical',
  'extracurricular',
  'test-prep',
  'application',
  'personal',
] as const;

/** Lifecycle status — mirrors the data-layer `Goal['status']` union. The board view groups by the
 *  three primary columns (not-started / in-progress / completed); deferred + dropped are filed
 *  off-board but kept so nothing is lost. */
export const STATUSES = [
  'not-started',
  'in-progress',
  'completed',
  'deferred',
  'dropped',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** A single milestone. `id` is optional on the way in — the handler stamps one when missing so the
 *  client can send brand-new milestones without inventing ids. */
export const milestoneSchema = z
  .object({
    id: z.string().min(1).max(120).optional(),
    label: z.string().min(1, 'milestone label is required').max(200),
    completed: z.boolean().optional(),
    completedDate: isoDate.optional(),
  })
  .strict();

/** Body for POST /goals. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    title: z.string().min(1, 'title is required').max(200),
    description: z.string().max(10000).optional(),
    category: z.enum(CATEGORIES).optional(),
    targetDate: isoDate.optional(),
    // School-year / period label, e.g. "Junior Year" or "2026-2027". Free-form per the spec.
    period: z.string().min(1).max(120).optional(),
    status: z.enum(STATUSES).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    milestones: z.array(milestoneSchema).max(100).optional(),
    linkedActivities: z.array(z.string().min(1)).max(500).optional(),
  })
  .strict();

/** Body for PUT /goals/:id — every field optional (milestones, progress, status, …). */
export const updateSchema = createSchema.partial();

/** Query for GET /goals — filter by period/status/category. Unknown params are ignored. */
export const listQuerySchema = z.object({
  period: z.string().min(1).max(120).optional(),
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
});

/** Path params for the by-id routes. */
export const idParamSchema = z.object({ id: z.string().min(1) });

/** Body for POST /goals/suggest — the profile context the AI shapes suggestions around. Every
 *  field is optional; the suggester degrades gracefully on a sparse profile. */
export const suggestSchema = z
  .object({
    gradeLevel: z.string().min(1).max(60).optional(),
    careerGoal: z.string().min(1).max(200).optional(),
    period: z.string().min(1).max(120).optional(),
    currentActivities: z.array(z.string().min(1).max(200)).max(100).optional(),
    targetColleges: z.array(z.string().min(1).max(200)).max(100).optional(),
    count: z.number().int().min(1).max(12).optional(),
  })
  .strict();

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type SuggestInput = z.infer<typeof suggestSchema>;

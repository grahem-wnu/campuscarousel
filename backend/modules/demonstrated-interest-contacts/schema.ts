// Request validation for the Demonstrated Interest + Contact Network endpoints. Every handler
// validates input before touching the data layer (specs/foundational/api.md); a failure → 422.

import { z } from '../../shared/api/index.js';

/** Touchpoint interaction types — mirrors the data-layer `Touchpoint['type']` union. */
export const TOUCHPOINT_TYPES = [
  'info-session',
  'campus-visit',
  'email-exchange',
  'phone-call',
  'webinar',
  'college-fair',
  'interview',
  'social-media',
  'other',
] as const;

/** Contact relationship types — mirrors `Contact['relationship']`. */
export const RELATIONSHIPS = ['mentor', 'supervisor', 'teacher', 'admissions', 'nurse', 'recommender', 'other'] as const;

/** The four recommendation slots (specs/modules/application-central recommendation board). */
export const RECOMMENDER_SLOTS = ['stem-teacher', 'humanities-teacher', 'clinical-supervisor', 'community-leader'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** Body for POST /colleges/:id/touchpoints. `.strict()` rejects unknown fields. `createdBy` is set
 *  server-side from the JWT, never accepted from the client. */
export const touchpointCreateSchema = z
  .object({
    type: z.enum(TOUCHPOINT_TYPES),
    date: isoDate,
    description: z.string().max(4000).optional(),
    contactPerson: z.string().max(200).optional(),
    contactEmail: z.string().email().max(320).optional(),
    contactPhone: z.string().max(40).optional(),
    followUpNeeded: z.boolean().optional(),
    followUpDate: isoDate.optional(),
    followUpCompleted: z.boolean().optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict();

export const touchpointUpdateSchema = touchpointCreateSchema.partial();

/** Body for POST /contacts. */
export const contactCreateSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(200),
    role: z.string().max(200).optional(),
    organization: z.string().max(200).optional(),
    relationship: z.enum(RELATIONSHIPS).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(320).optional(),
    linkedCollegeId: z.string().max(200).optional(),
    howMet: z.string().max(2000).optional(),
    dateMet: isoDate.optional(),
    lastContactDate: isoDate.optional(),
    notes: z.string().max(4000).optional(),
    isPotentialRecommender: z.boolean().optional(),
    recommenderSlot: z.enum(RECOMMENDER_SLOTS).optional(),
  })
  .strict();

export const contactUpdateSchema = contactCreateSchema.partial();

/** Optional body for POST /contacts/:id/recommender-brief. */
export const briefSchema = z
  .object({ focus: z.string().max(500).optional() })
  .strict();

export const collegeParamSchema = z.object({ id: z.string().min(1) });
export const touchpointParamSchema = z.object({ id: z.string().min(1), tid: z.string().min(1) });
export const contactParamSchema = z.object({ id: z.string().min(1) });

export type TouchpointCreate = z.infer<typeof touchpointCreateSchema>;
export type ContactCreate = z.infer<typeof contactCreateSchema>;

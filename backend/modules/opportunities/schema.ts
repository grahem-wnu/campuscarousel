// Input validation for the opportunities module (v2.1 Module 18). `.strict()` rejects unknown fields
// on user-authored bodies; discovery candidates use a plain object (zod strips unknown keys) since
// they're AI-shaped.

import { z } from '../../shared/api/index.js';

const type = z.enum([
  'volunteer',
  'shadowing',
  'internship',
  'training-program',
  'summer-program',
  'job',
  'club',
  'other',
]);

const status = z.enum(['discovered', 'interested', 'applied', 'active', 'completed', 'dismissed']);

const contact = z
  .object({
    name: z.string().max(120).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(40).optional(),
  })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    organization: z.string().max(200).optional(),
    type,
    location: z.string().max(200).optional(),
    distanceNote: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    eligibility: z.array(z.string().max(200)).max(30).optional(),
    timeCommitment: z.string().max(200).optional(),
    cost: z.number().min(0).optional(),
    applicationUrl: z.string().max(2048).optional(),
    contact: contact.optional(),
    applicationDeadline: isoDate.optional(),
    status: status.optional(),
    linkedActivityId: z.string().max(200).optional(),
    linkedClinicalId: z.string().max(200).optional(),
  })
  .strict();

export const updateSchema = createSchema.partial();

export const discoverSchema = z
  .object({
    type: type.optional(),
    location: z.string().max(200).optional(),
    query: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

// Discovery candidate (AI-shaped) — unknown keys are stripped (default zod object behavior).
const candidate = z.object({
  name: z.string().min(1).max(200),
  organization: z.string().max(200).optional(),
  type: type.optional(),
  location: z.string().max(200).optional(),
  distanceNote: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  eligibility: z.array(z.string().max(200)).max(30).optional(),
  timeCommitment: z.string().max(200).optional(),
  cost: z.number().min(0).optional(),
  applicationUrl: z.string().max(2048).optional(),
  applicationDeadline: z.string().max(40).optional(),
});

export const bulkAddSchema = z.object({ items: z.array(candidate).min(1).max(50) }).strict();

export const listQuerySchema = z
  .object({ type: type.optional(), status: status.optional(), search: z.string().max(200).optional() })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) }).strict();
export const jobIdParamSchema = z.object({ jobId: z.string().min(1) }).strict();

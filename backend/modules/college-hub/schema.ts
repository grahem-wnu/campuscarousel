// Request validation for the College Hub endpoints. Every handler validates input with one of these
// before touching the data layer (specs/foundational/api.md); a failure → 422 envelope. Field names
// mirror the data-layer `College` type (frozen contract).

import { z } from '../../shared/api/index.js';

export const COLLEGE_STATUSES = [
  'researching',
  'considering',
  'target',
  'applying',
  'applied',
  'accepted',
  'rejected',
  'enrolled',
  'removed',
] as const;

export const PROGRAM_TYPES = [
  'direct-admit',
  'secondary-application',
  'accelerated',
  'transfer-pathway',
] as const;

export const NOTE_TYPES = [
  'general',
  'visit',
  'research',
  'contact',
  'financial-aid',
  'application-update',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');
const url = z.string().url('must be a valid URL').max(2000);

const deadlines = z
  .object({
    earlyAction: isoDate.optional(),
    regularDecision: isoDate.optional(),
    programApp: isoDate.optional(),
  })
  .strict();

const branding = z
  .object({
    logoUrl: url.optional(),
    primaryColor: z.string().max(40).optional(),
    secondaryColor: z.string().max(40).optional(),
    mascot: z.string().max(120).optional(),
  })
  .strict();

const contactInfo = z
  .object({
    programAdmissionsPhone: z.string().max(60).optional(),
    programAdmissionsEmail: z.string().max(200).optional(),
    programAdmissionsUrl: url.optional(),
    financialAidPhone: z.string().max(60).optional(),
    financialAidUrl: url.optional(),
    campusVisitUrl: url.optional(),
  })
  .strict();

const testimonial = z
  .object({
    quote: z.string().min(1).max(2000),
    attribution: z.string().max(200).optional(),
    source: url.optional(),
  })
  .strict();

/** The set of College fields a caller may edit. Used (partial) by create and update. */
const editableCollege = {
  name: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  state: z.string().max(100).optional(),
  programType: z.enum(PROGRAM_TYPES).optional(),
  isDirectAdmit: z.boolean().optional(),
  isTopPick: z.boolean().optional(),
  ranking: z.string().max(120).optional(),
  overview: z.string().max(8000).optional(),
  admissionsDeepDive: z.string().max(8000).optional(),
  employmentRate: z.string().max(120).optional(),
  tuitionInState: z.number().nonnegative().max(1_000_000).optional(),
  tuitionOutOfState: z.number().nonnegative().max(1_000_000).optional(),
  costOfAttendanceOutOfState: z.number().nonnegative().max(1_000_000).optional(),
  estimatedNetPriceAfterAid: z.number().nonnegative().max(1_000_000).optional(),
  percentReceivingAid: z.string().max(120).optional(),
  avgAidAmount: z.number().nonnegative().max(1_000_000).optional(),
  applicationFee: z.number().nonnegative().max(10_000).optional(),
  estimatedTotalCost: z.number().nonnegative().max(2_000_000).optional(),
  estimatedCostAfterAid: z.number().nonnegative().max(2_000_000).optional(),
  acceptanceRateProgram: z.string().max(60).optional(),
  acceptanceRateUniversity: z.string().max(60).optional(),
  avgGPAAdmitted: z.string().max(60).optional(),
  prerequisites: z.array(z.string().min(1).max(200)).max(100).optional(),
  applicationDeadlines: deadlines.optional(),
  essayPrompts: z.array(z.string().min(1).max(2000)).max(50).optional(),
  requiredTests: z.array(z.string().min(1).max(120)).max(50).optional(),
  testimonials: z.array(testimonial).max(20).optional(),
  campusImageUrls: z.array(url).max(20).optional(),
  specialNotes: z.string().max(10000).optional(),
  website: url.optional(),
  dataSources: z.array(url).max(50).optional(),
  dataAsOf: z.string().max(40).optional(),
  branding: branding.optional(),
  contactInfo: contactInfo.optional(),
  status: z.enum(COLLEGE_STATUSES).optional(),
  fitScore: z.number().min(0).max(100).optional(),
};

/** POST /colleges — minimally just a name (then auto-hydrate); other fields optional. */
export const createSchema = z.object(editableCollege).strict();

/** PUT /colleges/:id — every editable field optional (name too). */
export const updateSchema = createSchema.partial();

/** PATCH /colleges/:id/top-pick. */
export const topPickSchema = z.object({ isTopPick: z.boolean() }).strict();

/** GET /colleges query — filters + sort + search. Unknown params ignored (API Gateway adds some). */
export const listQuerySchema = z.object({
  status: z.enum(COLLEGE_STATUSES).optional(),
  programType: z.enum(PROGRAM_TYPES).optional(),
  state: z.string().max(100).optional(),
  isTopPick: z.enum(['true', 'false']).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['name', 'fitScore', 'status', 'tuition', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  includeRemoved: z.enum(['true', 'false']).optional(),
});

/** POST /colleges/discover — discovery filters; returns candidates, adds nothing. */
export const discoverSchema = z
  .object({
    query: z.string().max(500).optional(),
    state: z.string().max(100).optional(),
    programType: z.enum(PROGRAM_TYPES).optional(),
    maxTuition: z.number().nonnegative().max(2_000_000).optional(),
    directAdmitOnly: z.boolean().optional(),
    limit: z.number().int().positive().max(25).optional(),
  })
  .strict();

/** POST /colleges/bulk-add — add several discovered colleges at once. */
export const bulkAddSchema = z
  .object({
    colleges: z.array(z.object(editableCollege).strict()).min(1).max(50),
  })
  .strict();

/** POST /colleges/:id/notes. */
export const noteSchema = z
  .object({
    content: z.string().min(1).max(10000),
    author: z.string().max(120).optional(),
    noteType: z.enum(NOTE_TYPES).optional(),
  })
  .strict();

const checklistItem = z
  .object({
    id: z.string().min(1).max(120),
    label: z.string().min(1).max(300),
    completed: z.boolean(),
    completedDate: isoDate.optional(),
    completedBy: z.string().max(120).optional(),
    dueDate: isoDate.optional(),
  })
  .strict();

/** PUT /colleges/:id/checklist — replace the whole checklist. */
export const checklistSchema = z
  .object({ items: z.array(checklistItem).max(200) })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) });

/** GET /colleges/discover/:jobId path param. */
export const jobIdParamSchema = z.object({ jobId: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type DiscoverInput = z.infer<typeof discoverSchema>;
export type BulkAddInput = z.infer<typeof bulkAddSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type ChecklistInput = z.infer<typeof checklistSchema>;

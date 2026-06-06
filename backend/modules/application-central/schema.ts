// Request validation for Application Central (essay workspace + AI essay partner). Field names mirror
// the data-layer `Essay` type (frozen contract).

import { z } from '../../shared/api/index.js';

export const ESSAY_STATUSES = ['brainstorming', 'drafting', 'reviewing', 'final'] as const;

const draft = z
  .object({
    version: z.number().int().min(1),
    content: z.string().max(100000),
    createdAt: z.string(),
    wordCount: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Body for POST /essays. */
export const createSchema = z
  .object({
    collegeId: z.string().max(200).optional(),
    prompt: z.string().max(5000).optional(),
    promptSource: z.string().max(200).optional(),
    status: z.enum(ESSAY_STATUSES).optional(),
    drafts: z.array(draft).max(100).optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict();

export const updateSchema = createSchema.partial();

/** GET /essays query — filter by college / status. */
export const listQuerySchema = z.object({
  collegeId: z.string().max(200).optional(),
  status: z.enum(ESSAY_STATUSES).optional(),
});

/** POST /essays/:id/draft — append a new version (the lib computes version + wordCount). */
export const addDraftSchema = z
  .object({
    content: z.string().min(1).max(100000),
  })
  .strict();

/** POST /essays/:id/find-experiences — AI surfaces relevant logged experiences for the prompt. */
export const findExperiencesSchema = z
  .object({
    prompt: z.string().max(5000).optional(),
  })
  .strict();

/** POST /essays/:id/review — AI feedback on a draft (feedback only, never a rewrite). */
export const reviewSchema = z
  .object({
    /** Which stored draft to review (defaults to the latest). */
    version: z.number().int().min(1).optional(),
    /** Or review ad-hoc content not yet saved as a draft. */
    content: z.string().max(100000).optional(),
    targetWords: z.number().int().positive().max(5000).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type AddDraftInput = z.infer<typeof addDraftSchema>;
export type FindExperiencesInput = z.infer<typeof findExperiencesSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;

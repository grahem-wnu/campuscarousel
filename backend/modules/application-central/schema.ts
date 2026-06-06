// Request validation for the Application Central (essay workspace) endpoints. Every handler
// validates input with one of these before touching the data layer (specs/foundational/api.md); a
// failure → 422 envelope.
//
// Scope note: this module currently ships the Essay workspace (the spec's headline feature + the
// canonical AI-privacy case). The application tracker, recommendation board, and SAT/ACT/AP score
// tracker need new data-layer entities (the Essay entity exists; those do not) — raised on
// .agent-bus/checkpoints/application-central.md for the supervisor, since the data layer is frozen.

import { z } from '../../shared/api/index.js';

export const ESSAY_STATUSES = ['brainstorming', 'drafting', 'reviewing', 'final'] as const;

/** Body for POST /essays. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    collegeId: z.string().min(1).max(200).optional(),
    prompt: z.string().max(5000).optional(),
    promptSource: z.string().max(300).optional(),
    status: z.enum(ESSAY_STATUSES).optional(),
    notes: z.string().max(20000).optional(),
    /** Optional first draft content; the server stamps version/wordCount/createdAt. */
    draftContent: z.string().max(100000).optional(),
  })
  .strict();

/** Body for PUT /essays/:id. All optional; `addDraftContent` appends a new version. */
export const updateSchema = z
  .object({
    collegeId: z.string().min(1).max(200).optional(),
    prompt: z.string().max(5000).optional(),
    promptSource: z.string().max(300).optional(),
    status: z.enum(ESSAY_STATUSES).optional(),
    notes: z.string().max(20000).optional(),
    /** Append a new draft version (server computes version, wordCount, createdAt). */
    addDraftContent: z.string().max(100000).optional(),
  })
  .strict();

/** Query for GET /essays — filter by college / status. */
export const listQuerySchema = z.object({
  collegeId: z.string().min(1).optional(),
  status: z.enum(ESSAY_STATUSES).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

/** Body for POST /essays/:id/find-experiences — optional extra focus for the AI. */
export const findExperiencesSchema = z
  .object({
    focus: z.string().max(2000).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

/** Body for POST /essays/:id/review — review a specific draft text, or the latest stored draft. */
export const reviewSchema = z
  .object({
    content: z.string().max(100000).optional(),
  })
  .strict();

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type FindExperiencesInput = z.infer<typeof findExperiencesSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;

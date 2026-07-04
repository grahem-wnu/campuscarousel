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
    targetWords: z.number().int().min(50).max(5000).optional(),
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

/** POST /essays/:id/practice-questions — AI sample questions in the target college's style. */
export const practiceQuestionsSchema = z
  .object({
    count: z.number().int().min(3).max(8).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) });

// ---------------------------------------------------------------------------
// Application tracker (APPLICATION# entity) — one row per college.
// ---------------------------------------------------------------------------
export const APPLICATION_STATUSES = ['planning', 'in-progress', 'submitted', 'under-review', 'decided', 'withdrawn'] as const;
export const APPLICATION_TYPES = ['early-action', 'early-decision', 'regular-decision', 'rolling'] as const;
export const COMPONENT_STATUSES = ['not-started', 'in-progress', 'submitted', 'complete', 'waived'] as const;
export const APPLICATION_DECISIONS = ['none', 'accepted', 'waitlisted', 'deferred', 'rejected'] as const;

const componentStatus = z.enum(COMPONENT_STATUSES);
const applicationComponents = z
  .object({
    essay: componentStatus.optional(),
    recommendations: componentStatus.optional(),
    transcript: componentStatus.optional(),
    testScores: componentStatus.optional(),
    financialAid: componentStatus.optional(),
  })
  .strict();

export const applicationCreateSchema = z
  .object({
    collegeId: z.string().min(1).max(200),
    status: z.enum(APPLICATION_STATUSES).optional(),
    applicationType: z.enum(APPLICATION_TYPES).optional(),
    deadline: z.string().max(40).optional(),
    submittedDate: z.string().max(40).optional(),
    components: applicationComponents.optional(),
    decision: z.enum(APPLICATION_DECISIONS).optional(),
    decisionDate: z.string().max(40).optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict();
export const applicationUpdateSchema = applicationCreateSchema.partial();
export const applicationQuerySchema = z.object({
  collegeId: z.string().max(200).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
});

// ---------------------------------------------------------------------------
// Recommendation strategy board (RECOMMENDATION# entity) — 4 canonical slots.
// ---------------------------------------------------------------------------
export const RECOMMENDATION_SLOTS = ['stem-teacher', 'humanities-teacher', 'clinical-supervisor', 'community-leader', 'other'] as const;
export const RECOMMENDATION_STATUSES = ['identified', 'asked', 'agreed', 'received', 'submitted', 'declined'] as const;

export const recommendationCreateSchema = z
  .object({
    slot: z.enum(RECOMMENDATION_SLOTS),
    contactId: z.string().max(200).optional(),
    contactName: z.string().max(200).optional(),
    relationshipStrength: z.enum(['strong', 'moderate', 'developing']).optional(),
    status: z.enum(RECOMMENDATION_STATUSES).optional(),
    askTimeline: z.string().max(200).optional(),
    askedDate: z.string().max(40).optional(),
    receivedDate: z.string().max(40).optional(),
    submittedColleges: z.array(z.string().max(200)).max(100).optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict();
export const recommendationUpdateSchema = recommendationCreateSchema.partial();

/** POST /recommendations/:id/brief — optional steer for the AI recommender brief. */
export const recommenderBriefSchema = z
  .object({
    focus: z.string().max(2000).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Test-score tracker (TESTSCORE# entity) — per-test record with per-college routing.
// ---------------------------------------------------------------------------
export const TEST_SCORE_TYPES = ['SAT', 'ACT', 'TEAS', 'AP'] as const;

export const testScoreCreateSchema = z
  .object({
    testType: z.enum(TEST_SCORE_TYPES),
    testDate: z.string().max(40).optional(),
    score: z.number().min(0).max(2000).optional(),
    sectionScores: z.record(z.number()).optional(),
    apSubject: z.string().max(200).optional(),
    superscore: z.number().min(0).max(2000).optional(),
    sentTo: z.array(z.string().max(200)).max(200).optional(),
    official: z.boolean().optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict();
export const testScoreUpdateSchema = testScoreCreateSchema.partial();
export const testScoreQuerySchema = z.object({
  testType: z.enum(TEST_SCORE_TYPES).optional(),
});

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type AddDraftInput = z.infer<typeof addDraftSchema>;
export type FindExperiencesInput = z.infer<typeof findExperiencesSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
export type RecommendationCreateInput = z.infer<typeof recommendationCreateSchema>;
export type TestScoreCreateInput = z.infer<typeof testScoreCreateSchema>;

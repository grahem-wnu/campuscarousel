// Application Central handlers — essay workspace + AI essay partner + a derived application overview.
// Essays are the student's working documents; identity comes from the JWT and the router 401s
// unauthenticated callers. PRIVACY: /find-experiences AND evaluation ground in activities/experience/
// motivation via gatherExperiences (aiVisibleSet off the JWT) — private entries surface only when keira
// is the caller. find-experiences output is returned LIVE (never persisted). The evaluation persists its
// full review (which may quote private-derived experiences) on the EssayReviewJob; a later cross-caller
// read is blocked by reviewStatus's creator-only guard, not by non-persistence. essay.lastReview is
// scores-only (derived from the draft text alone) and safe to store.

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data, Essay } from '../../shared/data/index.js';
import {
  addDraftSchema,
  applicationCreateSchema,
  applicationQuerySchema,
  applicationUpdateSchema,
  collegePracticeSchema,
  createSchema,
  findExperiencesSchema,
  idParamSchema,
  jobIdParamSchema,
  listQuerySchema,
  recommendationCreateSchema,
  recommendationUpdateSchema,
  recommenderBriefSchema,
  reviewSchema,
  testScoreCreateSchema,
  testScoreQuerySchema,
  testScoreUpdateSchema,
  updateSchema,
} from './schema.js';
import { gatherCollegeContext, gatherExperiences, gatherSharedExperiences } from './grounding.js';
import { parseTargetWords } from './words.js';
import { buildOverview } from './overview.js';
import { buildDecisionMatrix } from './decision.js';
import {
  makeBedrockEssayReviewer,
  makeBedrockExperienceFinder,
  makeBedrockPracticeQuestions,
  makeBedrockRecommenderBrief,
  wordCountOf,
  type EssayReviewer,
  type ExperienceFinder,
  type PracticeQuestionGenerator,
  type RecommenderBriefer,
} from './ai.js';
import { makeInlineDispatcher, type PracticeDispatcher } from './practice.js';
import { makeInlineReviewDispatcher, type ReviewDispatcher } from './review.js';

export interface AppCentralHandlers {
  listEssays: Handler;
  detailEssay: Handler;
  createEssay: Handler;
  updateEssay: Handler;
  removeEssay: Handler;
  addDraft: Handler;
  findExperiences: Handler;
  startReview: Handler;
  reviewStatus: Handler;
  practiceQuestionsForCollege: Handler;
  practiceQuestionsStatus: Handler;
  overview: Handler;
  // Application tracker
  listApplications: Handler;
  detailApplication: Handler;
  createApplication: Handler;
  updateApplication: Handler;
  removeApplication: Handler;
  decisionMatrix: Handler;
  // Recommendation strategy board
  listRecommendations: Handler;
  createRecommendation: Handler;
  updateRecommendation: Handler;
  removeRecommendation: Handler;
  recommenderBrief: Handler;
  // Test-score tracker
  listTestScores: Handler;
  createTestScore: Handler;
  updateTestScore: Handler;
  removeTestScore: Handler;
}

export interface AppCentralDeps {
  getData: () => Data;
  finder?: ExperienceFinder;
  reviewer?: EssayReviewer;
  briefer?: RecommenderBriefer;
  practice?: PracticeQuestionGenerator;
  /** Dispatcher for async practice-question jobs; production injects the SQS enqueuer. Defaults to
   *  running inline with the Bedrock generator (so tests/no-queue complete the job before the re-read). */
  practiceDispatch?: PracticeDispatcher;
  /** Dispatcher for async essay-evaluation jobs; production injects the SQS enqueuer. Defaults to
   *  running inline with the Bedrock reviewer (so tests/no-queue complete the job before the re-read). */
  reviewDispatch?: ReviewDispatcher;
  now?: () => Date;
}

type Draft = NonNullable<Essay['drafts']>[number];

export function makeHandlers(deps: AppCentralDeps): AppCentralHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const finder = deps.finder ?? makeBedrockExperienceFinder();
  const reviewer = deps.reviewer ?? makeBedrockEssayReviewer();
  const briefer = deps.briefer ?? makeBedrockRecommenderBrief();
  const practice = deps.practice ?? makeBedrockPracticeQuestions();
  // Default dispatch (tests / no queue): generate inline so the re-read returns a completed job.
  // Production injects the SQS enqueuer (essay-coach queue) via routes.manifest.
  const practiceDispatch = deps.practiceDispatch ?? makeInlineDispatcher(getData, practice);
  const reviewDispatch = deps.reviewDispatch ?? makeInlineReviewDispatcher(getData, reviewer, now);

  async function requireEssay(id: string): Promise<Essay> {
    const e = await getData().essays.get(id);
    if (!e) throw Errors.notFound('Essay not found');
    return e;
  }

  /** Read the active student's intended major(s) so AI brainstorm/brief prompts reflect their focus. */
  async function activeMajors(): Promise<string[]> {
    try {
      return (await getData().studentProfile.get())?.intendedMajors ?? [];
    } catch {
      return [];
    }
  }

  return {
    // GET /essays — list, filter by college / status.
    listEssays: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items = await getData().essays.list();
      if (q.collegeId) items = items.filter((e) => e.collegeId === q.collegeId);
      if (q.status) items = items.filter((e) => e.status === q.status);
      return { status: 200, body: { essays: items } };
    },

    // GET /essays/:id.
    detailEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      return { status: 200, body: await requireEssay(id) };
    },

    // POST /essays — create (defaults to brainstorming).
    createEssay: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().essays.create({
        ...input,
        targetWords: input.targetWords ?? parseTargetWords(input.prompt),
        status: input.status ?? 'brainstorming',
        createdBy: ctx.requester.username,
      } as Parameters<Data['essays']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /essays/:id.
    updateEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      await requireEssay(id);
      return { status: 200, body: await getData().essays.update(id, patch) };
    },

    // DELETE /essays/:id.
    removeEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await requireEssay(id);
      await getData().essays.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /essays/:id/draft — append a new version (version + wordCount computed), advance status.
    addDraft: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const { content } = validateBody(addDraftSchema, ctx);
      const essay = await requireEssay(id);
      const drafts = essay.drafts ?? [];
      const version = drafts.reduce((max, d) => Math.max(max, d.version), 0) + 1;
      const draft: Draft = { version, content, createdAt: now().toISOString(), wordCount: wordCountOf(content) };
      const status = essay.status === 'brainstorming' || essay.status === undefined ? 'drafting' : essay.status;
      const updated = await getData().essays.update(id, { drafts: [...drafts, draft], status });
      return { status: 201, body: updated };
    },

    // POST /essays/:id/find-experiences — AI surfaces relevant experiences (keira's private entries
    // included only for keira). Returned LIVE; never persisted.
    findExperiences: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(findExperiencesSchema, ctx);
      const data = getData();
      const essay = await requireEssay(id);
      const [pool, college] = await Promise.all([gatherExperiences(data, ctx.requester), gatherCollegeContext(data, essay.collegeId)]);
      const result = await finder({ prompt: body.prompt ?? essay.prompt ?? '', pool, majors: await activeMajors(), college });
      return { status: 200, body: { result, basedOn: pool.counts } };
    },

    // POST /essays/:id/review — ASYNC. Evaluation runs ~15-20s (near the 30s ceiling), so create a job,
    // dispatch to the essay-coach worker, return 202; the frontend polls reviewStatus. NEVER rewrites
    // (result.rewrote === false). Grounded in the target college's admissions data when linked AND in the
    // caller's privacy-filtered logged experiences — so we STAMP the caller's identity (reviewerUsername/
    // reviewerRole) onto the job: the worker reconstructs a Requester from it to filter the pool, and the
    // full review is persisted on the job behind reviewStatus's creator-only guard. lastReview stays scores-only.
    startReview: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(reviewSchema, ctx);
      await requireEssay(id);
      const job = await getData().essayReviewJobs.create({
        essayId: id,
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.targetWords !== undefined ? { targetWords: body.targetWords } : {}),
        reviewerUsername: ctx.requester.username,
        reviewerRole: ctx.requester.role,
        status: 'pending',
      } as Parameters<Data['essayReviewJobs']['create']>[0]);
      await reviewDispatch(job.jobId);
      const after = await getData().essayReviewJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /essays/:id/review/:jobId — poll an evaluation job (by globally-unique jobId; :id is contextual).
    reviewStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().essayReviewJobs.get(jobId);
      // Creator-only read: the persisted review may quote private-derived experiences, so only the
      // caller who requested the evaluation may read it back. A different family caller gets 404
      // (fail-closed also covers pre-identity jobs, which lack reviewerUsername).
      if (!job || job.reviewerUsername !== ctx.requester.username) throw Errors.notFound('Evaluation job not found');
      return { status: 200, body: job };
    },

    // POST /essays/practice-questions — ASYNC. Model-only generation runs ~25–30s and 503s at the
    // request path's ~30s ceiling, so create a job, enqueue it (focus queue), return 202; the worker
    // fills the result and the frontend polls practiceQuestionsStatus.
    practiceQuestionsForCollege: async (ctx) => {
      const body = validateBody(collegePracticeSchema, ctx);
      const data = getData();
      const job = await data.practiceQuestionJobs.create({
        ...(body.collegeId ? { collegeId: body.collegeId } : {}),
        ...(body.collegeName ? { collegeName: body.collegeName } : {}),
        ...(body.count ? { count: body.count } : {}),
        status: 'pending',
      } as Parameters<Data['practiceQuestionJobs']['create']>[0]);
      await practiceDispatch(job.jobId);
      const after = await data.practiceQuestionJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /essays/practice-questions/:jobId — poll a practice job's status + result.
    practiceQuestionsStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().practiceQuestionJobs.get(jobId);
      if (!job) throw Errors.notFound('Practice question job not found');
      return { status: 200, body: job };
    },

    // GET /applications/overview — derived per-college status (deadlines, essays, scores).
    overview: async () => {
      const data = getData();
      const [colleges, essays, exams] = await Promise.all([data.colleges.list(), data.essays.list(), data.exams.list()]);
      const todayIso = now().toISOString().slice(0, 10);
      return { status: 200, body: { applications: buildOverview(colleges, essays, exams, todayIso) } };
    },

    // --- Application tracker (persisted APPLICATION# rows) ----------------------------------
    // GET /applications — list, optionally filtered by college / status (ordered by deadline).
    listApplications: async (ctx) => {
      const q = validateQuery(applicationQuerySchema, ctx);
      let items = await getData().applications.list();
      if (q.collegeId) items = items.filter((a) => a.collegeId === q.collegeId);
      if (q.status) items = items.filter((a) => a.status === q.status);
      return { status: 200, body: { applications: items } };
    },

    // GET /applications/:id.
    detailApplication: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const app = await getData().applications.get(id);
      if (!app) throw Errors.notFound('Application not found');
      return { status: 200, body: app };
    },

    // POST /applications — one tracker row per college.
    createApplication: async (ctx) => {
      const input = validateBody(applicationCreateSchema, ctx);
      const created = await getData().applications.create({
        ...input,
        status: input.status ?? 'planning',
        createdBy: ctx.requester.username,
      } as Parameters<Data['applications']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /applications/:id.
    updateApplication: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(applicationUpdateSchema, ctx);
      const existing = await getData().applications.get(id);
      if (!existing) throw Errors.notFound('Application not found');
      return { status: 200, body: await getData().applications.update(id, patch) };
    },

    // DELETE /applications/:id.
    removeApplication: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const existing = await getData().applications.get(id);
      if (!existing) throw Errors.notFound('Application not found');
      await getData().applications.delete(id);
      return { status: 204, body: undefined };
    },

    // GET /applications/decision-matrix — compare offers once decisions arrive.
    decisionMatrix: async () => {
      const data = getData();
      const [applications, colleges] = await Promise.all([data.applications.list(), data.colleges.list()]);
      return { status: 200, body: { decisions: buildDecisionMatrix(applications, colleges) } };
    },

    // --- Recommendation strategy board -----------------------------------------------------
    // GET /recommendations.
    listRecommendations: async () => {
      return { status: 200, body: { recommendations: await getData().recommendations.list() } };
    },

    // POST /recommendations.
    createRecommendation: async (ctx) => {
      const input = validateBody(recommendationCreateSchema, ctx);
      const created = await getData().recommendations.create({
        ...input,
        status: input.status ?? 'identified',
        createdBy: ctx.requester.username,
      } as Parameters<Data['recommendations']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /recommendations/:id.
    updateRecommendation: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(recommendationUpdateSchema, ctx);
      const existing = await getData().recommendations.get(id);
      if (!existing) throw Errors.notFound('Recommendation not found');
      return { status: 200, body: await getData().recommendations.update(id, patch) };
    },

    // DELETE /recommendations/:id.
    removeRecommendation: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const existing = await getData().recommendations.get(id);
      if (!existing) throw Errors.notFound('Recommendation not found');
      await getData().recommendations.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /recommendations/:id/brief — AI recommender brief. Grounded ONLY in family-visible
    // experiences (gatherSharedExperiences) — a brief is shared with a recommender, so it can never
    // carry a private entry, even for keira. Returned LIVE but ALSO persisted onto the record so the
    // board can show the latest brief; persistence is safe precisely because no private content is in it.
    recommenderBrief: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(recommenderBriefSchema, ctx);
      const data = getData();
      const rec = await data.recommendations.get(id);
      if (!rec) throw Errors.notFound('Recommendation not found');
      const pool = await gatherSharedExperiences(data);
      const brief = await briefer({
        slot: rec.slot,
        contactName: rec.contactName,
        relationship: rec.relationshipStrength,
        focus: body.focus,
        pool,
        majors: await activeMajors(),
      });
      const aiBrief = [brief.summary, ...brief.talkingPoints, ...brief.suggestedStories].join('\n');
      const updated = await data.recommendations.update(id, { aiBrief });
      return { status: 200, body: { brief, recommendation: updated } };
    },

    // --- Test-score tracker ----------------------------------------------------------------
    // GET /test-scores — optionally filter by testType (ordered by testDate).
    listTestScores: async (ctx) => {
      const q = validateQuery(testScoreQuerySchema, ctx);
      let items = await getData().testScores.list();
      if (q.testType) items = items.filter((s) => s.testType === q.testType);
      return { status: 200, body: { testScores: items } };
    },

    // POST /test-scores.
    createTestScore: async (ctx) => {
      const input = validateBody(testScoreCreateSchema, ctx);
      const created = await getData().testScores.create({
        ...input,
        createdBy: ctx.requester.username,
      } as Parameters<Data['testScores']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /test-scores/:id — also how schools-received routing (sentTo) is updated.
    updateTestScore: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(testScoreUpdateSchema, ctx);
      const existing = await getData().testScores.get(id);
      if (!existing) throw Errors.notFound('Test score not found');
      return { status: 200, body: await getData().testScores.update(id, patch) };
    },

    // DELETE /test-scores/:id.
    removeTestScore: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const existing = await getData().testScores.get(id);
      if (!existing) throw Errors.notFound('Test score not found');
      await getData().testScores.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede `:id`; the router also prefers higher static specificity. */
export function buildRoutes(h: AppCentralHandlers) {
  return [
    { method: 'GET' as const, path: '/applications/overview', handler: h.overview },
    { method: 'GET' as const, path: '/applications/decision-matrix', handler: h.decisionMatrix },
    { method: 'GET' as const, path: '/applications', handler: h.listApplications },
    { method: 'POST' as const, path: '/applications', handler: h.createApplication },
    { method: 'GET' as const, path: '/applications/:id', handler: h.detailApplication },
    { method: 'PUT' as const, path: '/applications/:id', handler: h.updateApplication },
    { method: 'DELETE' as const, path: '/applications/:id', handler: h.removeApplication },
    { method: 'GET' as const, path: '/essays', handler: h.listEssays },
    { method: 'POST' as const, path: '/essays', handler: h.createEssay },
    { method: 'POST' as const, path: '/essays/practice-questions', handler: h.practiceQuestionsForCollege },
    { method: 'GET' as const, path: '/essays/practice-questions/:jobId', handler: h.practiceQuestionsStatus },
    { method: 'GET' as const, path: '/essays/:id', handler: h.detailEssay },
    { method: 'PUT' as const, path: '/essays/:id', handler: h.updateEssay },
    { method: 'DELETE' as const, path: '/essays/:id', handler: h.removeEssay },
    { method: 'POST' as const, path: '/essays/:id/draft', handler: h.addDraft },
    { method: 'POST' as const, path: '/essays/:id/find-experiences', handler: h.findExperiences },
    { method: 'POST' as const, path: '/essays/:id/review', handler: h.startReview },
    { method: 'GET' as const, path: '/essays/:id/review/:jobId', handler: h.reviewStatus },
    { method: 'GET' as const, path: '/recommendations', handler: h.listRecommendations },
    { method: 'POST' as const, path: '/recommendations', handler: h.createRecommendation },
    { method: 'PUT' as const, path: '/recommendations/:id', handler: h.updateRecommendation },
    { method: 'DELETE' as const, path: '/recommendations/:id', handler: h.removeRecommendation },
    { method: 'POST' as const, path: '/recommendations/:id/brief', handler: h.recommenderBrief },
    { method: 'GET' as const, path: '/test-scores', handler: h.listTestScores },
    { method: 'POST' as const, path: '/test-scores', handler: h.createTestScore },
    { method: 'PUT' as const, path: '/test-scores/:id', handler: h.updateTestScore },
    { method: 'DELETE' as const, path: '/test-scores/:id', handler: h.removeTestScore },
  ];
}

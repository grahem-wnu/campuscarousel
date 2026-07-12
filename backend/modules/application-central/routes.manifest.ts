// Route manifest for Application Central. The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline string literals for the `check:routes` guard; buildRoutes() in handlers.ts
// holds the same table for tests. Data client resolved lazily so importing never needs TABLE_NAME.
// AI finder/reviewer default to the Bedrock-backed implementations (model id from BEDROCK_MODEL_ID),
// each with a deterministic curated fallback.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeSqsPracticeEnqueuer, makeBedrockPracticeQuestions } from './practice.js';
import { makeSqsReviewEnqueuer, makeBedrockEssayReviewer } from './review.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
// Practice-question generation AND essay evaluation are async `essay-coach` jobs for the 300s worker
// (model-only, but both blow the request path's ~30s ceiling). They enqueue onto the dedicated
// essay-coach queue (ESSAY_COACH_QUEUE_URL, fallback focus/hydration); the worker runs the work.
const h = makeHandlers({
  getData,
  practiceDispatch: makeSqsPracticeEnqueuer(getData, makeBedrockPracticeQuestions()),
  reviewDispatch: makeSqsReviewEnqueuer(getData, makeBedrockEssayReviewer(), () => new Date()),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/applications/overview', handler: h.overview },
  { method: 'GET', path: '/applications/decision-matrix', handler: h.decisionMatrix },
  { method: 'GET', path: '/applications', handler: h.listApplications },
  { method: 'POST', path: '/applications', handler: h.createApplication },
  { method: 'GET', path: '/applications/:id', handler: h.detailApplication },
  { method: 'PUT', path: '/applications/:id', handler: h.updateApplication },
  { method: 'DELETE', path: '/applications/:id', handler: h.removeApplication },
  { method: 'GET', path: '/essays', handler: h.listEssays },
  { method: 'POST', path: '/essays', handler: h.createEssay },
  { method: 'POST', path: '/essays/practice-questions', handler: h.practiceQuestionsForCollege },
  { method: 'GET', path: '/essays/practice-questions/:jobId', handler: h.practiceQuestionsStatus },
  { method: 'GET', path: '/essays/:id', handler: h.detailEssay },
  { method: 'PUT', path: '/essays/:id', handler: h.updateEssay },
  { method: 'DELETE', path: '/essays/:id', handler: h.removeEssay },
  { method: 'POST', path: '/essays/:id/draft', handler: h.addDraft },
  { method: 'POST', path: '/essays/:id/find-experiences', handler: h.findExperiences },
  { method: 'POST', path: '/essays/:id/review', handler: h.startReview },
  { method: 'GET', path: '/essays/:id/review/:jobId', handler: h.reviewStatus },
  { method: 'GET', path: '/recommendations', handler: h.listRecommendations },
  { method: 'POST', path: '/recommendations', handler: h.createRecommendation },
  { method: 'PUT', path: '/recommendations/:id', handler: h.updateRecommendation },
  { method: 'DELETE', path: '/recommendations/:id', handler: h.removeRecommendation },
  { method: 'POST', path: '/recommendations/:id/brief', handler: h.recommenderBrief },
  { method: 'GET', path: '/test-scores', handler: h.listTestScores },
  { method: 'POST', path: '/test-scores', handler: h.createTestScore },
  { method: 'PUT', path: '/test-scores/:id', handler: h.updateTestScore },
  { method: 'DELETE', path: '/test-scores/:id', handler: h.removeTestScore },
];

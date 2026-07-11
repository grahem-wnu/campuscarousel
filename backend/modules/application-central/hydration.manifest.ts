// Worker-side registration for Application Central's async work. build-lambda.mjs globs each module's
// hydration.manifest.ts and statically imports its `hydration` export into the worker's type→handler
// registry (one registration per module). An `essay-coach` message runs this handler on the shared 300s
// worker (full budget for the slow, model-only generation the API can't run inline), sub-routed by the
// message `kind`: `kind: 'review'` → async essay evaluation; otherwise (`kind: 'questions'`) → practice
// questions. Follows the focus module's kind-sub-routing precedent.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { ESSAY_COACH_TYPE, makeBedrockPracticeQuestions, makeWorkerHandler } from './practice.js';
import { makeBedrockEssayReviewer, makeReviewWorkerHandler } from './review.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const questions = makeWorkerHandler(getData, makeBedrockPracticeQuestions());
const review = makeReviewWorkerHandler(getData, makeBedrockEssayReviewer(), () => new Date());

/** One registered type for the module's async work; sub-route by `kind`. */
const handler = async (payload: unknown): Promise<void> => {
  const kind = (payload as { kind?: string } | null)?.kind;
  if (kind === 'review') return review(payload);
  return questions(payload); // default / kind:'questions'
};

export const hydration = { type: ESSAY_COACH_TYPE, handler };

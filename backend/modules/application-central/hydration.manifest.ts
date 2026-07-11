// Worker-side registration for async practice-question generation. build-lambda.mjs globs each module's
// hydration.manifest.ts and statically imports its `hydration` export into the worker's type→handler
// registry. A `practice-questions` message runs this handler on the shared 300s worker (full budget for
// the slow, model-only generation the API can't run inline).

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { ESSAY_COACH_TYPE, makeBedrockPracticeQuestions, makeWorkerHandler } from './practice.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handler = makeWorkerHandler(getData, makeBedrockPracticeQuestions());

export const hydration = { type: ESSAY_COACH_TYPE, handler };

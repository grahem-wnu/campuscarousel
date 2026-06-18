// Worker-side registration for async benchmark research. The hydration-bundle build
// (backend/scripts/build-lambda.mjs) globs each module's `hydration.manifest.ts` and statically
// imports its `hydration` export into the worker's `type → handler` registry. So when an SQS message
// with `type: 'benchmark-research'` lands on the shared hydration queue, the worker invokes this
// handler with the full 300s budget — enough for the web-grounded Bedrock research the API can't run
// inline. The researcher is the same Bedrock binding the routes use; the data client is lazy.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockResearcher } from './bedrock.js';
import { BENCHMARK_RESEARCH_TYPE, makeWorkerHandler } from './research.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handler = makeWorkerHandler(getData, () => bedrockResearcher);

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: BENCHMARK_RESEARCH_TYPE, handler };

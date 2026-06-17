// Worker-side hydration registration for Peer Benchmark refresh.
//
// The hydration-bundle build (backend/scripts/build-lambda.mjs) discovers each module's
// `hydration.manifest.ts` and imports its `hydration` export into
// backend/lambda/generated/hydration-manifests.ts; the worker
// (backend/lambda/hydration.ts) builds a `type → handler` registry from those (failing loudly on a
// duplicate `type`). So this file's sole contract is: `export const hydration = { type, handler }`.
// When an SQS message with `type: 'benchmark-refresh'` arrives, the worker invokes this handler
// (inside the message's tenant/student context, established by the worker entry).
//
// The data client + researcher are resolved lazily, exactly like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockResearcher } from './bedrock.js';
import { BENCHMARK_REFRESH_TYPE, makeRefreshWorkerHandler } from './refresh-job.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handler = makeRefreshWorkerHandler(getData, bedrockResearcher);

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: BENCHMARK_REFRESH_TYPE, handler };

// Worker-side hydration registration for College Hub.
//
// The hydration-bundle build (backend/scripts/build-lambda.mjs) globs each module's
// `hydration.manifest.ts`, statically importing its `hydration` export into
// backend/lambda/generated/hydration-manifests.ts; the worker (backend/lambda/hydration.ts) builds a
// `type → handler` registry from those (failing loudly on a duplicate `type`). So this file's sole
// contract is: `export const hydration = { type, handler }` (a `HydrationRegistration`). When an SQS
// message with `type: 'college-hydrate'` arrives, the worker invokes this handler.
//
// The handler resolves the data client lazily, exactly like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { HYDRATION_TYPE, makeWorkerHandler } from './hydration.js';

let cached: Data | undefined;
const handler = makeWorkerHandler((): Data => (cached ??= dataFromEnv()));

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: HYDRATION_TYPE, handler };

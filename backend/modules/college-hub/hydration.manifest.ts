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
import { makeDiscoverWorkerHandler } from './discover.js';
import { makePrepWorkerHandler } from './prep-ai.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const hydrate = makeWorkerHandler(getData);
const discover = makeDiscoverWorkerHandler(getData);
const prep = makePrepWorkerHandler(getData);

// One registration handles every async college job on the shared queue, routed by message shape:
// `task:'prep'` is a prep-plan job; a `jobId` is a discovery job; otherwise it's a hydration job
// (`collegeId`).
const handler = async (payload: unknown): Promise<void> => {
  const msg = (payload ?? {}) as { jobId?: unknown; task?: unknown };
  if (msg.task === 'prep') return prep(payload);
  return typeof msg.jobId === 'string' ? discover(payload) : hydrate(payload);
};

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: HYDRATION_TYPE, handler };

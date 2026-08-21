// Worker-side registration for College Scholarship Research.
//
// `build-lambda.mjs` globs each module's `hydration.manifest.ts` and statically imports its
// `hydration` export into backend/lambda/generated/hydration-manifests.ts; the worker
// (backend/lambda/hydration.ts) builds a `type → handler` registry from those, failing loudly on a
// duplicate `type`. So this file's whole contract is `export const hydration = { type, handler }`.
//
// One registration covers both async jobs — the handler routes on the message's `kind`
// ('search' | 'research'), mirroring how college-hub routes its several async college jobs.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { SCHOLARSHIP_TYPE, makeWorkerHandler } from './jobs.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: SCHOLARSHIP_TYPE, handler: makeWorkerHandler(getData) };

// Worker-side registration for the Focus overview. build-lambda.mjs globs each module's
// hydration.manifest.ts and statically imports its `hydration` export into the generated registry;
// the worker (backend/lambda/hydration.ts) keys handlers by message `type`. When an SQS message with
// `type: 'focus-overview'` arrives, the worker runs the web-grounded overviewer and writes the result
// onto the per-student focus-overview singleton. Data client resolved lazily, like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { OVERVIEW_TYPE, makeOverviewWorkerHandler } from './overview.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: OVERVIEW_TYPE, handler: makeOverviewWorkerHandler(getData) };

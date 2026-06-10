// Worker-side registration for Opportunity Finder discovery (v2.1 Module 18). build-lambda.mjs globs
// each module's hydration.manifest.ts into the worker's registry, keyed by `type`. When an SQS
// message with type 'opportunity-discover' arrives, the worker runs the web-grounded discovery job.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { DISCOVER_TYPE, makeDiscoverWorkerHandler } from './discover.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());

/** `{ type, handler }` — matches the worker's HydrationRegistration; globbed into the registry. */
export const hydration = { type: DISCOVER_TYPE, handler: makeDiscoverWorkerHandler(getData) };

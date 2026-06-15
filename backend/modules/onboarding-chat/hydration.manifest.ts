// Worker-side registration for post-onboarding seeding. build-lambda.mjs globs each module's
// hydration.manifest.ts into the worker registry; the worker keys handlers by message `type` and runs
// them inside the message's tenant/student context. An `onboarding-seed` message (enqueued by POST
// /onboarding/finish) runs the starter goals + college discovery + budget seeding off the request path.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockSuggester } from '../goal-tracker/bedrock.js';
import { makeSqsEnqueuer } from '../college-hub/enqueue.js';
import { makeAssetsEnqueuer } from '../college-hub/assets-enqueue.js';
import { makeBedrockCollegeSeeder } from './ai.js';
import { SEED_TYPE, makeSeedWorkerHandler, type SeedDeps } from './seed.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const seedDeps: SeedDeps = {
  getData,
  suggester: bedrockSuggester,
  collegeSeeder: makeBedrockCollegeSeeder(),
  hydrateDispatch: makeSqsEnqueuer(getData),
  assetsDispatch: makeAssetsEnqueuer(getData),
};

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: SEED_TYPE, handler: makeSeedWorkerHandler(seedDeps) };

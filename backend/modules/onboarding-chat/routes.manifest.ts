// Route manifest for conversational onboarding. Globbed by the router. Data client resolved lazily.
// Composes existing building blocks: the goal suggester (goal-tracker) and the college-discovery
// enqueuer (college-hub) so finish can seed goals + kick off discovery without reimplementing them.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockSuggester } from '../goal-tracker/bedrock.js';
import { makeSqsEnqueuer } from '../college-hub/enqueue.js';
import { makeAssetsEnqueuer } from '../college-hub/assets-enqueue.js';
import { makeBedrockCollegeSeeder, makeBedrockOnboardingChatter } from './ai.js';
import { makeHandlers } from './handlers.js';
import { makeSqsSeedEnqueuer, type SeedDeps } from './seed.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
// Seeding building blocks (goal suggester + college discovery/assets), reused by the seed job.
const seedDeps: SeedDeps = {
  getData,
  suggester: bedrockSuggester,
  collegeSeeder: makeBedrockCollegeSeeder(),
  hydrateDispatch: makeSqsEnqueuer(getData),
  assetsDispatch: makeAssetsEnqueuer(getData),
};
const handlers = makeHandlers({
  getData,
  chatter: makeBedrockOnboardingChatter(),
  // finish enqueues this (or runs inline if no queue) so seeding never blocks the response.
  seedDispatch: makeSqsSeedEnqueuer(seedDeps),
});

export const routes: RouteDef[] = [
  { method: 'POST', path: '/onboarding/chat', handler: handlers.chat },
  { method: 'POST', path: '/onboarding/finish', handler: handlers.finish },
  { method: 'POST', path: '/onboarding/reset', handler: handlers.reset },
];

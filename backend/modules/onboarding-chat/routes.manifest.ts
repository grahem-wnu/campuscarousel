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

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handlers = makeHandlers({
  getData,
  chatter: makeBedrockOnboardingChatter(),
  suggester: bedrockSuggester,
  collegeSeeder: makeBedrockCollegeSeeder(),
  hydrateDispatch: makeSqsEnqueuer(getData),
  assetsDispatch: makeAssetsEnqueuer(getData),
});

export const routes: RouteDef[] = [
  { method: 'POST', path: '/onboarding/chat', handler: handlers.chat },
  { method: 'POST', path: '/onboarding/finish', handler: handlers.finish },
  { method: 'POST', path: '/onboarding/reset', handler: handlers.reset },
];

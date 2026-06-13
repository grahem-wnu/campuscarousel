// Route manifest for conversational onboarding. Globbed by the router. Data client resolved lazily.
// Composes existing building blocks: the goal suggester (goal-tracker) and the college-discovery
// enqueuer (college-hub) so finish can seed goals + kick off discovery without reimplementing them.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockSuggester } from '../goal-tracker/bedrock.js';
import { makeSqsDiscoverEnqueuer } from '../college-hub/discover.js';
import { makeBedrockOnboardingChatter } from './ai.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handlers = makeHandlers({
  getData,
  chatter: makeBedrockOnboardingChatter(),
  suggester: bedrockSuggester,
  discoverDispatch: makeSqsDiscoverEnqueuer(getData),
});

export const routes: RouteDef[] = [
  { method: 'POST', path: '/onboarding/chat', handler: handlers.chat },
  { method: 'POST', path: '/onboarding/finish', handler: handlers.finish },
];

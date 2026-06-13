import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';
import type { OnboardingChatter } from './ai.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';

const sig = (r: { method: string; path: string }): string => `${r.method} ${r.path}`;

const stubs = {
  getData: () => ({}) as Data,
  chatter: (async () => ({ reply: '', profile: {}, done: false })) as OnboardingChatter,
  suggester: { suggest: async () => [] } as GoalSuggester,
  discoverDispatch: async () => {},
};

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers(stubs)).map(sig).sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose POST /onboarding/chat + POST /onboarding/finish', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(['POST /onboarding/chat', 'POST /onboarding/finish']);
  });
});

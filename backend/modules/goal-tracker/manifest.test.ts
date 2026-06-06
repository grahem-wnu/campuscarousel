// Guards against drift between the production route table (routes.manifest.ts, which the
// check:routes guard and the Lambda use) and buildRoutes() (which the router integration test uses
// with injected fakes). They must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { GoalSuggester } from './suggester.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers(() => ({}) as Data, () => ({}) as GoalSuggester))
      .map(sig)
      .sort();
    const manifest = manifestRoutes.map(sig).sort();
    expect(manifest).toEqual(built);
  });

  it('expose all six Goal Tracker endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /goals/:id',
        'GET /goals',
        'GET /goals/:id',
        'POST /goals',
        'POST /goals/suggest',
        'PUT /goals/:id',
      ].sort(),
    );
  });
});

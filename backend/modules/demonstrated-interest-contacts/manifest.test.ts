// Guards against drift between the production route table (routes.manifest.ts) and buildRoutes()
// (the test path). They must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { Briefer } from './briefs.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers(() => ({}) as Data, () => ({}) as Briefer)).map(sig).sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose all twelve endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /colleges/:id/touchpoints/:tid',
        'DELETE /contacts/:id',
        'GET /colleges/:id/touchpoints',
        'GET /contacts',
        'GET /contacts/:id',
        'GET /contacts/recommenders',
        'GET /touchpoints/follow-ups',
        'POST /colleges/:id/touchpoints',
        'POST /contacts',
        'POST /contacts/:id/recommender-brief',
        'PUT /colleges/:id/touchpoints/:tid',
        'PUT /contacts/:id',
      ].sort(),
    );
  });
});

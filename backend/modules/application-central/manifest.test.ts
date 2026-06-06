// Guards against drift between the production route table (routes.manifest.ts) and buildRoutes()
// (the router integration test). They must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { EssayReviewer, ExperienceFinder } from './ai.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(
      makeHandlers(() => ({}) as Data, () => ({}) as unknown as ExperienceFinder, () => ({}) as unknown as EssayReviewer),
    )
      .map(sig)
      .sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose all seven essay-workspace endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /essays/:id',
        'GET /essays',
        'GET /essays/:id',
        'POST /essays',
        'POST /essays/:id/find-experiences',
        'POST /essays/:id/review',
        'PUT /essays/:id',
      ].sort(),
    );
  });
});

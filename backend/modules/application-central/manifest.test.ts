import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers({ getData: () => ({}) as Data })).map(sig).sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose all nine Application Central endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /essays/:id',
        'GET /applications/overview',
        'GET /essays',
        'GET /essays/:id',
        'POST /essays',
        'POST /essays/:id/draft',
        'POST /essays/:id/find-experiences',
        'POST /essays/:id/review',
        'PUT /essays/:id',
      ].sort(),
    );
  });
});

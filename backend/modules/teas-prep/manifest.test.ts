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

  it('expose all eight TEAS Prep endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /teas/:id',
        'GET /teas',
        'GET /teas/:id',
        'GET /teas/progress',
        'POST /teas',
        'POST /teas/analyze',
        'POST /teas/study-plan',
        'PUT /teas/:id',
      ].sort(),
    );
  });
});

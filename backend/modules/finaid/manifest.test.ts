import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }): string => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers({ getData: () => ({}) as Data }))
      .map(sig)
      .sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose the seven finaid endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /finaid/:id',
        'GET /finaid',
        'GET /finaid/:id',
        'GET /finaid/summary',
        'POST /finaid',
        'POST /finaid/seed',
        'PUT /finaid/:id',
      ].sort(),
    );
  });
});

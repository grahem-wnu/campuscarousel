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

  it('expose the eight opportunity endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /opportunities/:id',
        'GET /opportunities',
        'GET /opportunities/:id',
        'GET /opportunities/discover/:jobId',
        'POST /opportunities',
        'POST /opportunities/bulk-add',
        'POST /opportunities/discover',
        'PUT /opportunities/:id',
      ].sort(),
    );
  });
});

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

  it('expose the full Application Central endpoint set (essays + tracker + rec board + scores)', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        // Essay workspace
        'GET /essays',
        'POST /essays',
        'GET /essays/:id',
        'PUT /essays/:id',
        'DELETE /essays/:id',
        'POST /essays/:id/draft',
        'POST /essays/:id/find-experiences',
        'POST /essays/:id/review',
        'POST /essays/practice-questions',
        // Application tracker + decision matrix
        'GET /applications/overview',
        'GET /applications/decision-matrix',
        'GET /applications',
        'POST /applications',
        'GET /applications/:id',
        'PUT /applications/:id',
        'DELETE /applications/:id',
        // Recommendation strategy board
        'GET /recommendations',
        'POST /recommendations',
        'PUT /recommendations/:id',
        'DELETE /recommendations/:id',
        'POST /recommendations/:id/brief',
        // Test-score tracker
        'GET /test-scores',
        'POST /test-scores',
        'PUT /test-scores/:id',
        'DELETE /test-scores/:id',
      ].sort(),
    );
  });
});

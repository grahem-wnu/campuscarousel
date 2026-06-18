// Guards against drift between the production route table (routes.manifest.ts) and buildRoutes()
// (used by the router test). They must register the exact same method+path set.

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

  it('expose all seventeen College Hub endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /colleges/:id',
        'GET /colleges',
        'GET /colleges/:id',
        'GET /colleges/:id/checklist',
        'GET /colleges/:id/notes',
        'GET /colleges/discover/:jobId',
        'PATCH /colleges/:id/top-pick',
        'POST /colleges',
        'POST /colleges/:id/checklist/suggest',
        'POST /colleges/:id/hydrate',
        'POST /colleges/:id/notes',
        'POST /colleges/:id/prep',
        'POST /colleges/assets-backfill',
        'POST /colleges/bulk-add',
        'POST /colleges/discover',
        'POST /colleges/hydrate-all',
        'PUT /colleges/:id',
        'PUT /colleges/:id/checklist',
      ].sort(),
    );
  });
});

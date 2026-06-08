// Guards against drift between the production route table (routes.manifest.ts, which the
// check:routes guard and the Lambda use) and buildRoutes() (which the router integration test uses
// with an injected data client). They must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers(() => ({}) as Data)).map(sig).sort();
    const manifest = manifestRoutes.map(sig).sort();
    expect(manifest).toEqual(built);
  });

  it('expose all eight Clinical Hours endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /clinical/:id',
        'GET /clinical',
        'GET /clinical/:id',
        'GET /clinical/summary',
        'GET /clinical/supervisors',
        'POST /clinical',
        'POST /clinical/export',
        'PUT /clinical/:id',
      ].sort(),
    );
  });
});

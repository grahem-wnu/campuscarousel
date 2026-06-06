// Guards against drift between the production route table (routes.manifest.ts, used by check:routes
// + the Lambda) and buildRoutes() (used by the router integration test with injected fakes). They
// must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { ScholarshipDiscoverer } from './discover.js';
import type { HydrationEnqueuer, InlineDispatcher } from './hydration.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(
      makeHandlers(
        () => ({}) as Data,
        () => ({}) as ScholarshipDiscoverer,
        () => ({}) as unknown as InlineDispatcher,
        () => ({}) as HydrationEnqueuer,
      ),
    )
      .map(sig)
      .sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose all nine Scholarship Tracker endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /scholarships/:id',
        'GET /scholarships',
        'GET /scholarships/:id',
        'GET /scholarships/summary',
        'POST /scholarships',
        'POST /scholarships/:id/hydrate',
        'POST /scholarships/bulk-add',
        'POST /scholarships/discover',
        'PUT /scholarships/:id',
      ].sort(),
    );
  });
});

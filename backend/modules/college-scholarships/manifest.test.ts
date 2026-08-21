// Guards against drift between the production route table (routes.manifest.ts, which check:routes
// and the Lambda read) and buildRoutes() (which the router integration test drives with fakes).
// They must register the exact same method+path set. Also pins the worker registration, since a
// wrong `type` would leave every job draining silently in the worker.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { SCHOLARSHIP_TYPE } from './jobs.js';
import { hydration } from './hydration.manifest.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers({ getData: () => ({}) as Data }))
      .map(sig)
      .sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('exposes all five endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /colleges/:id/scholarships/:scholarshipId',
        'GET /colleges/:id/scholarships',
        'GET /colleges/:id/scholarships/:scholarshipId',
        'POST /colleges/:id/scholarships/:scholarshipId/research',
        'POST /colleges/:id/scholarships/search',
      ].sort(),
    );
  });
});

describe('hydration.manifest', () => {
  it('registers this module under its message type', () => {
    expect(hydration.type).toBe(SCHOLARSHIP_TYPE);
    expect(typeof hydration.handler).toBe('function');
  });
});

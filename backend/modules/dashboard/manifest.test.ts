import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set (GET /dashboard)', () => {
    const built = buildRoutes(makeHandlers({ getData: () => ({}) as Data })).map(sig).sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
    expect(manifestRoutes.map(sig)).toEqual(['GET /dashboard']);
  });
});

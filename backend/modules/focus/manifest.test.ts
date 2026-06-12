import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }): string => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers({ getData: () => ({}) as Data, overviewDispatch: async () => {} }))
      .map(sig)
      .sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose GET /focus + POST /focus/overview', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(['GET /focus', 'POST /focus/overview']);
  });
});

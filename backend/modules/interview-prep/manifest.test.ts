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

  it('expose all nine Interview Prep endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      [
        'DELETE /interviews/:id',
        'GET /interviews',
        'GET /interviews/:id',
        'GET /interviews/questions',
        'POST /interviews',
        'POST /interviews/mock',
        'POST /interviews/mock/:sessionId/answer',
        'POST /interviews/questions',
        'PUT /interviews/:id',
      ].sort(),
    );
  });
});

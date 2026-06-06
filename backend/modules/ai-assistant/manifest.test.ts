// Guards against drift between the production route table (routes.manifest.ts) and buildRoutes()
// (the test path). They must register the exact same method+path set.

import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { Assistant } from './chat.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

describe('routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    const built = buildRoutes(makeHandlers(() => ({}) as Data, () => ({}) as Assistant)).map(sig).sort();
    expect(manifestRoutes.map(sig).sort()).toEqual(built);
  });

  it('expose all three AI Assistant endpoints', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(
      ['GET /ai/conversations', 'GET /ai/conversations/:id', 'POST /ai/chat'].sort(),
    );
  });
});

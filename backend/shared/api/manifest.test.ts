import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectRoutes, loadManifests, loadRoutes } from './index.js';
import type { Method, RouteManifest } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '__fixtures__');

describe('collectRoutes', () => {
  it('flattens multiple manifests into one list', () => {
    const manifests: RouteManifest[] = [
      { routes: [{ method: 'GET', path: '/a', handler: async () => ({ status: 200, body: null }) }] },
      { routes: [{ method: 'GET', path: '/b', handler: async () => ({ status: 200, body: null }) }] },
      {}, // a manifest with no routes is fine
    ];
    expect(collectRoutes(manifests).map((r) => r.path)).toEqual(['/a', '/b']);
  });

  it('throws on a duplicate method+path across manifests (case-insensitive method)', () => {
    // The lowercase 'get' is cast deliberately to exercise the runtime case-insensitive
    // dedup; module authors can only write the uppercase Method literals at the type level.
    const dup: RouteManifest[] = [
      { routes: [{ method: 'GET', path: '/dup', handler: async () => ({ status: 200, body: null }) }] },
      { routes: [{ method: 'get' as Method, path: '/dup', handler: async () => ({ status: 200, body: null }) }] },
    ];
    expect(() => collectRoutes(dup)).toThrow(/Duplicate route across manifests/);
  });
});

describe('loadManifests / loadRoutes (filesystem globbing)', () => {
  it('discovers a manifest in each module subdirectory and skips dirs without one', async () => {
    const manifests = await loadManifests(FIXTURES);
    // modA + modB have manifests; modC (README only) is skipped.
    expect(manifests).toHaveLength(2);
  });

  it('loads and flattens all routes under a base dir', async () => {
    const routes = await loadRoutes(FIXTURES);
    const keys = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(keys).toEqual(['GET /alpha', 'GET /beta', 'POST /alpha']);
  });

  it('returns an empty list for a non-existent directory', async () => {
    expect(await loadManifests(join(FIXTURES, 'does-not-exist'))).toEqual([]);
  });
});

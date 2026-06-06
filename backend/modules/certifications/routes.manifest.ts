// Route manifest for the Certifications module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME — only a live invocation does. The suggester defaults to the deterministic curated one
// (see suggester.ts for why a Bedrock-backed suggester is not wired here yet).

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/certifications/expiring', handler: handlers.expiring },
  { method: 'POST', path: '/certifications/suggest', handler: handlers.suggest },
  { method: 'GET', path: '/certifications', handler: handlers.list },
  { method: 'POST', path: '/certifications', handler: handlers.create },
  { method: 'GET', path: '/certifications/:id', handler: handlers.detail },
  { method: 'PUT', path: '/certifications/:id', handler: handlers.update },
  { method: 'DELETE', path: '/certifications/:id', handler: handlers.remove },
];

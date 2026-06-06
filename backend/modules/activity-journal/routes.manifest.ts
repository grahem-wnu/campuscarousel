// Route manifest for the Activity Journal module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically
// parses this file) can detect cross-module duplicates. The handler bindings come from
// `makeHandlers`; `buildRoutes` in handlers.ts holds the same table for tests, and
// manifest.test.ts asserts the two never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME — only a live invocation does.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers((): Data => (cached ??= dataFromEnv()));

export const routes: RouteDef[] = [
  { method: 'GET', path: '/activities/summary', handler: handlers.summary },
  { method: 'GET', path: '/activities', handler: handlers.list },
  { method: 'POST', path: '/activities', handler: handlers.create },
  { method: 'GET', path: '/activities/:id', handler: handlers.detail },
  { method: 'PUT', path: '/activities/:id', handler: handlers.update },
  { method: 'DELETE', path: '/activities/:id', handler: handlers.remove },
];

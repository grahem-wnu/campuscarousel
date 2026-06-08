// Route manifest for the Course Planner module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME — only a live invocation does.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers((): Data => (cached ??= dataFromEnv()));

export const routes: RouteDef[] = [
  { method: 'GET', path: '/courses/gpa', handler: handlers.gpa },
  { method: 'GET', path: '/courses/prerequisites/:collegeId', handler: handlers.prerequisites },
  { method: 'GET', path: '/courses', handler: handlers.list },
  { method: 'POST', path: '/courses', handler: handlers.create },
  { method: 'PUT', path: '/courses/:id', handler: handlers.update },
  { method: 'DELETE', path: '/courses/:id', handler: handlers.remove },
];

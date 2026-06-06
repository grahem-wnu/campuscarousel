// Route manifest for the Goal Tracker module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME — only a live invocation does. The AI suggester is likewise injected; until the shared
// Bedrock client exists (raised on .agent-bus/checkpoints/goal-tracker.md) it returns a clean 503.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { unavailableSuggester } from './suggester.js';

let cached: Data | undefined;
const handlers = makeHandlers(
  (): Data => (cached ??= dataFromEnv()),
  () => unavailableSuggester,
);

export const routes: RouteDef[] = [
  { method: 'GET', path: '/goals', handler: handlers.list },
  { method: 'POST', path: '/goals', handler: handlers.create },
  { method: 'POST', path: '/goals/suggest', handler: handlers.suggest },
  { method: 'GET', path: '/goals/:id', handler: handlers.detail },
  { method: 'PUT', path: '/goals/:id', handler: handlers.update },
  { method: 'DELETE', path: '/goals/:id', handler: handlers.remove },
];

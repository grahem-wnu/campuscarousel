// Route manifest for the Scholarship Tracker module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// method+path are inline string literals so the `check:routes` guard (static parse) can detect
// cross-module duplicates. Handler bindings come from `makeHandlers`; `buildRoutes` in handlers.ts
// holds the same table for tests, and manifest.test.ts asserts the two never drift apart.
//
// The data client is resolved lazily so importing this manifest never requires TABLE_NAME. The AI
// discoverer + SQS hydration enqueuer are injected too; both currently degrade to a clean 503 until
// the async hydration infra lands (raised on .agent-bus/checkpoints/scholarship-tracker.md).

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { unavailableDiscoverer } from './discover.js';
import { makeHandlers } from './handlers.js';
import { unavailableEnqueuer } from './hydration.js';

let cached: Data | undefined;
const handlers = makeHandlers(
  (): Data => (cached ??= dataFromEnv()),
  () => unavailableDiscoverer,
  () => unavailableEnqueuer,
);

export const routes: RouteDef[] = [
  { method: 'GET', path: '/scholarships/summary', handler: handlers.summary },
  { method: 'GET', path: '/scholarships', handler: handlers.list },
  { method: 'POST', path: '/scholarships', handler: handlers.create },
  { method: 'POST', path: '/scholarships/discover', handler: handlers.discover },
  { method: 'POST', path: '/scholarships/bulk-add', handler: handlers.bulkAdd },
  { method: 'GET', path: '/scholarships/:id', handler: handlers.detail },
  { method: 'PUT', path: '/scholarships/:id', handler: handlers.update },
  { method: 'DELETE', path: '/scholarships/:id', handler: handlers.remove },
  { method: 'POST', path: '/scholarships/:id/hydrate', handler: handlers.hydrate },
];

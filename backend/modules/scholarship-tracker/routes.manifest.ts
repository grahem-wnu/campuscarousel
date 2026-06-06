// Route manifest for the Scholarship Tracker module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// method+path are inline string literals so the `check:routes` guard (static parse) can detect
// cross-module duplicates. Handler bindings come from `makeHandlers`; `buildRoutes` in handlers.ts
// holds the same table for tests, and manifest.test.ts asserts the two never drift apart.
//
// All AI is wired live (lazily): the data client, the Bedrock discoverer, the inline hydration
// dispatcher, and the SQS bulk enqueuer are resolved on first use so importing this manifest never
// constructs an AWS client or requires TABLE_NAME/BEDROCK_MODEL_ID/HYDRATION_QUEUE_URL.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeBedrockDiscoverer } from './ai.js';
import type { ScholarshipDiscoverer } from './discover.js';
import { makeHandlers } from './handlers.js';
import { makeInlineDispatcher, makeSqsEnqueuer, type HydrationEnqueuer, type InlineDispatcher } from './hydration.js';

let cachedData: Data | undefined;
const getData = (): Data => (cachedData ??= dataFromEnv());

let cachedDiscoverer: ScholarshipDiscoverer | undefined;
let cachedDispatch: InlineDispatcher | undefined;
let cachedEnqueuer: HydrationEnqueuer | undefined;

const handlers = makeHandlers(
  getData,
  () => (cachedDiscoverer ??= makeBedrockDiscoverer()),
  () => (cachedDispatch ??= makeInlineDispatcher(getData)),
  () => (cachedEnqueuer ??= makeSqsEnqueuer()),
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

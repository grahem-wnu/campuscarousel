// Route manifest for the Peer Benchmark module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME. The AI researcher is likewise injected: the production binding (bedrock.ts) calls
// Bedrock when BEDROCK_MODEL_ID is set, and degrades to a clean 503 locally/unconfigured.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockResearcher } from './bedrock.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers(
  (): Data => (cached ??= dataFromEnv()),
  () => bedrockResearcher,
);

export const routes: RouteDef[] = [
  { method: 'GET', path: '/colleges/:id/benchmark', handler: handlers.detail },
  { method: 'POST', path: '/colleges/:id/benchmark/refresh', handler: handlers.refresh },
  { method: 'GET', path: '/benchmarks/aggregate', handler: handlers.aggregate },
  { method: 'GET', path: '/benchmarks/gaps', handler: handlers.gaps },
];

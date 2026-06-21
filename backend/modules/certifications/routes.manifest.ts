// Route manifest for the Certifications module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request) so importing this manifest never requires
// TABLE_NAME — only a live invocation does. `/suggest` is wired to the Bedrock-backed suggester
// (model id from BEDROCK_MODEL_ID env, never hardcoded); it falls back to the curated list on any
// Bedrock error/timeout, so the endpoint is always useful.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeBedrockSuggester } from './suggester.js';
import { makeBedrockGuidanceResearcher } from './guidance.js';
import { makeSqsGuidanceEnqueuer } from './enqueue.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handlers = makeHandlers({
  getData,
  suggester: makeBedrockSuggester(),
  // Guidance research is async: enqueue a `cert-guidance` job for the 300s worker (web-grounded
  // research blows the request path's 30s ceiling). The worker does the web search; here we just send.
  guidanceDispatch: makeSqsGuidanceEnqueuer(getData, makeBedrockGuidanceResearcher({ webSearch: true })),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/certifications/expiring', handler: handlers.expiring },
  { method: 'POST', path: '/certifications/suggest', handler: handlers.suggest },
  { method: 'POST', path: '/certifications/guidance', handler: handlers.guidance },
  { method: 'GET', path: '/certifications/guidance/:jobId', handler: handlers.guidanceStatus },
  { method: 'GET', path: '/certifications', handler: handlers.list },
  { method: 'POST', path: '/certifications', handler: handlers.create },
  { method: 'GET', path: '/certifications/:id', handler: handlers.detail },
  { method: 'PUT', path: '/certifications/:id', handler: handlers.update },
  { method: 'DELETE', path: '/certifications/:id', handler: handlers.remove },
];

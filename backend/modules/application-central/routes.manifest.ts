// Route manifest for Application Central (essay workspace). The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// method+path are inline string literals so the `check:routes` guard (static parse) can detect
// cross-module duplicates. Handler bindings come from `makeHandlers`; `buildRoutes` in handlers.ts
// holds the same table for tests, and manifest.test.ts asserts the two never drift apart.
//
// Data client + Bedrock finder/reviewer are resolved lazily so importing this never constructs an
// AWS client or requires TABLE_NAME/BEDROCK_MODEL_ID.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeBedrockExperienceFinder, makeBedrockReviewer, type EssayReviewer, type ExperienceFinder } from './ai.js';
import { makeHandlers } from './handlers.js';

let cachedData: Data | undefined;
let cachedFinder: ExperienceFinder | undefined;
let cachedReviewer: EssayReviewer | undefined;

const handlers = makeHandlers(
  (): Data => (cachedData ??= dataFromEnv()),
  () => (cachedFinder ??= makeBedrockExperienceFinder()),
  () => (cachedReviewer ??= makeBedrockReviewer()),
);

export const routes: RouteDef[] = [
  { method: 'GET', path: '/essays', handler: handlers.list },
  { method: 'POST', path: '/essays', handler: handlers.create },
  { method: 'GET', path: '/essays/:id', handler: handlers.detail },
  { method: 'PUT', path: '/essays/:id', handler: handlers.update },
  { method: 'DELETE', path: '/essays/:id', handler: handlers.remove },
  { method: 'POST', path: '/essays/:id/find-experiences', handler: handlers.findExperiences },
  { method: 'POST', path: '/essays/:id/review', handler: handlers.review },
];

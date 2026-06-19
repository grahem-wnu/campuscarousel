// Route manifest for the Campus Visit Planner module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// Production wires the Bedrock-backed AI visit-prep seam; it falls back to the curated offline
// implementation on any error or when BEDROCK_MODEL_ID is unset. The data client and the AI client
// are resolved lazily so importing this manifest never constructs an AWS client.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeBedrockPrep } from './prep.js';

let cached: Data | undefined;
const handlers = makeHandlers({
  getData: (): Data => (cached ??= dataFromEnv()),
  prep: makeBedrockPrep(),
});

// Inline string-literal method+path so the check:routes guard can detect cross-module duplicates.
// buildRoutes() in handlers.ts holds the same table for tests; manifest.test.ts asserts no drift.
export const routes: RouteDef[] = [
  { method: 'POST', path: '/colleges/:id/visits/:vid/prep', handler: handlers.prep },
  { method: 'GET', path: '/colleges/:id/visits', handler: handlers.list },
  { method: 'POST', path: '/colleges/:id/visits', handler: handlers.create },
  { method: 'PUT', path: '/colleges/:id/visits/:vid', handler: handlers.update },
  { method: 'DELETE', path: '/colleges/:id/visits/:vid', handler: handlers.remove },
];

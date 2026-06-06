// Route manifest for the Demonstrated Interest + Contact Network module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// method+path are inline string literals so the `check:routes` guard can detect cross-module
// duplicates. `buildRoutes` in handlers.ts holds the same table for tests (manifest.test.ts asserts
// no drift). The data client is resolved lazily; the AI briefer is injected (bedrock.ts), degrading
// to a clean 503 when BEDROCK_MODEL_ID is unset.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockBriefer } from './bedrock.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers(
  (): Data => (cached ??= dataFromEnv()),
  () => bedrockBriefer,
);

export const routes: RouteDef[] = [
  { method: 'GET', path: '/colleges/:id/touchpoints', handler: h.listTouchpoints },
  { method: 'POST', path: '/colleges/:id/touchpoints', handler: h.createTouchpoint },
  { method: 'PUT', path: '/colleges/:id/touchpoints/:tid', handler: h.updateTouchpoint },
  { method: 'DELETE', path: '/colleges/:id/touchpoints/:tid', handler: h.deleteTouchpoint },
  { method: 'GET', path: '/touchpoints/follow-ups', handler: h.followUps },
  { method: 'GET', path: '/contacts/recommenders', handler: h.recommenders },
  { method: 'GET', path: '/contacts', handler: h.listContacts },
  { method: 'POST', path: '/contacts', handler: h.createContact },
  { method: 'POST', path: '/contacts/:id/recommender-brief', handler: h.recommenderBrief },
  { method: 'GET', path: '/contacts/:id', handler: h.getContact },
  { method: 'PUT', path: '/contacts/:id', handler: h.updateContact },
  { method: 'DELETE', path: '/contacts/:id', handler: h.deleteContact },
];

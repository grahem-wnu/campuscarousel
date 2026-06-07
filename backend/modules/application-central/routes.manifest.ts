// Route manifest for Application Central. The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline string literals for the `check:routes` guard; buildRoutes() in handlers.ts
// holds the same table for tests. Data client resolved lazily so importing never needs TABLE_NAME.
// AI finder/reviewer default to the Bedrock-backed implementations (model id from BEDROCK_MODEL_ID),
// each with a deterministic curated fallback.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/applications/overview', handler: h.overview },
  { method: 'GET', path: '/essays', handler: h.listEssays },
  { method: 'POST', path: '/essays', handler: h.createEssay },
  { method: 'GET', path: '/essays/:id', handler: h.detailEssay },
  { method: 'PUT', path: '/essays/:id', handler: h.updateEssay },
  { method: 'DELETE', path: '/essays/:id', handler: h.removeEssay },
  { method: 'POST', path: '/essays/:id/draft', handler: h.addDraft },
  { method: 'POST', path: '/essays/:id/find-experiences', handler: h.findExperiences },
  { method: 'POST', path: '/essays/:id/review', handler: h.review },
];

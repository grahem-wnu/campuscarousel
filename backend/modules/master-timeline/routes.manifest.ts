// Route manifest for the Master Timeline. The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline string literals for the `check:routes` guard; buildRoutes() in handlers.ts
// holds the same table for tests. Data client resolved lazily so importing never needs TABLE_NAME.
// The analyze handler defaults to the Bedrock-backed analyzer (model id from BEDROCK_MODEL_ID) with a
// deterministic curated fallback.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/timeline/upcoming', handler: h.upcoming },
  { method: 'POST', path: '/timeline/analyze', handler: h.analyze },
  { method: 'POST', path: '/timeline/dismiss', handler: h.dismiss },
  { method: 'GET', path: '/timeline', handler: h.timeline },
];

// Route manifest for Documents (v2.1 F2). The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline literals for the `check:routes` guard; buildRoutes() in handlers.ts holds the
// same table for tests. Data client + S3 store resolve lazily so importing never needs TABLE_NAME or
// DOCUMENTS_BUCKET. upload-url precedes :id so the static segment wins.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/documents', handler: h.list },
  { method: 'POST', path: '/documents/upload-url', handler: h.uploadUrl },
  { method: 'POST', path: '/documents', handler: h.create },
  { method: 'GET', path: '/documents/:id', handler: h.detail },
  { method: 'PUT', path: '/documents/:id', handler: h.update },
  { method: 'DELETE', path: '/documents/:id', handler: h.remove },
];

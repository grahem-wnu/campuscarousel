// Route manifest for the student profile (v2.1 F4). Data client resolved lazily so importing never
// needs TABLE_NAME. buildRoutes() in handlers.ts holds the same table for tests.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/profile', handler: h.get },
  { method: 'PUT', path: '/profile', handler: h.put },
];

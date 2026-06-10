// Route manifest for the Financial Aid Center (v2.1 Module 19). Static segments (seed, summary)
// precede :id. Data client resolved lazily so importing never needs TABLE_NAME.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/finaid', handler: h.list },
  { method: 'POST', path: '/finaid/seed', handler: h.seed },
  { method: 'GET', path: '/finaid/summary', handler: h.summary },
  { method: 'POST', path: '/finaid', handler: h.create },
  { method: 'GET', path: '/finaid/:id', handler: h.detail },
  { method: 'PUT', path: '/finaid/:id', handler: h.update },
  { method: 'DELETE', path: '/finaid/:id', handler: h.remove },
];

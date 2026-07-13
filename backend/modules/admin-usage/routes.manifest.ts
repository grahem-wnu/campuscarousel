// Route manifest for the admin usage reports. `GET /admin/usage` (roles: ['admin']) runs in tenant
// context; the handler reads via the BASE (unscoped) client with an explicit T#<tenant>#USAGE PK so a
// platform admin can cross tenants. `GET /admin/usage/families` (platformAdmin) iterates the tenant
// registry and ranks every family by cost. Clients resolved lazily from the environment.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, tableClientFromEnv, type Data, type TableClient } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cachedClient: TableClient | undefined;
let cachedData: Data | undefined;
const h = makeHandlers({
  getClient: () => (cachedClient ??= tableClientFromEnv()),
  getData: () => (cachedData ??= dataFromEnv()),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/admin/usage', handler: h.usage, roles: ['admin'] },
  { method: 'GET', path: '/admin/usage/families', handler: h.families, platformAdmin: true },
  { method: 'GET', path: '/admin/usage/reconciliation', handler: h.reconciliation, platformAdmin: true },
];

// Route manifest for the admin usage report. `roles: ['admin']` runs in tenant context; the handler
// reads via the BASE (unscoped) client with an explicit T#<tenant>#USAGE PK so a platform admin can
// cross tenants. Data client resolved lazily from the environment.

import type { RouteDef } from '../../shared/api/index.js';
import { tableClientFromEnv, type TableClient } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: TableClient | undefined;
const h = makeHandlers({ getClient: () => (cached ??= tableClientFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/admin/usage', handler: h.usage, roles: ['admin'] },
];

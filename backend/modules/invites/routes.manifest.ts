// Route manifest for super-admin invites (SaaS sub-project 2). All platform-admin only. Data client
// resolved lazily. The registry/invites repos are global (base client), so these run without a tenant
// context. (Public redemption is wired separately as an unauthenticated route in infra — see redeem.ts.)

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'POST', path: '/admin/invites', handler: h.create, platformAdmin: true },
  { method: 'GET', path: '/admin/invites', handler: h.list, platformAdmin: true },
  { method: 'POST', path: '/admin/invites/:code/revoke', handler: h.revoke, platformAdmin: true },
];

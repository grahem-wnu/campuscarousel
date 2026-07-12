// Route manifest for Reminders (v2.1 F1). The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline string literals for the `check:routes` guard; buildRoutes() in handlers.ts
// holds the same table for tests. Data client + SES sender resolve lazily so importing never needs
// TABLE_NAME or AWS. The send-test handler emails via the real SES sender (REMINDER_SENDER_EMAIL).

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

// Reminder settings are FAMILY-LEVEL (tenant-scoped, not per-child), so a `student` login must not
// reconfigure the family digest or fire test emails to family addresses. GET stays open to any family
// role (the digest gate reads it); the mutations are guarded to guardians. The router enforces `roles`
// before the body is parsed, and its member auto-block does NOT cover `student` — hence the explicit list.
export const routes: RouteDef[] = [
  { method: 'GET', path: '/reminders/settings', handler: h.getSettings },
  { method: 'PUT', path: '/reminders/settings', handler: h.putSettings, roles: ['admin', 'parent'] },
  { method: 'POST', path: '/reminders/send-test', handler: h.sendTest, roles: ['admin', 'parent'] },
];

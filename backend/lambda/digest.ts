// Lambda entry for the scheduled deadline-reminder digest (AsyncStack). EventBridge invokes this
// hourly. MULTI-TENANT: it enumerates the tenant registry (global, base client) and runs each family's
// digest inside that family's AsyncLocalStorage context, so the data layer scopes every read to that
// tenant. Per-tenant try/catch — one bad family never skips the rest. CDK ships this as `index.handler`
// via Code.fromAsset(backend/dist/digest).

import { dataFromEnv } from '../shared/data/index.js';
import { sesSenderFromEnv } from '../shared/email/index.js';
import { runWithTenant } from '../shared/tenant/index.js';
import { runScheduledDigest } from '../modules/reminders/run.js';

export const handler = async (): Promise<{ tenants: number; sent: number }> => {
  const from = process.env.REMINDER_SENDER_EMAIL;
  if (!from) {
    // Misconfiguration — fail loudly so the CloudWatch error alarm fires rather than silently no-op.
    throw new Error('digest: REMINDER_SENDER_EMAIL is not set');
  }
  const appUrl = process.env.APP_URL ?? 'https://keirasjourney.com';
  const data = dataFromEnv();
  const sender = sesSenderFromEnv();

  const tenants = await data.tenants.list(); // global registry — no tenant context needed
  let sent = 0;
  for (const tenant of tenants) {
    try {
      const result = await runWithTenant(tenant.tenantId, () =>
        runScheduledDigest({ data, sender, from, appUrl, now: () => new Date() }),
      );
      sent += result.sent;
    } catch (err) {
      // One family's failure must not abort the others.
      console.error('digest: tenant failed', tenant.tenantId, err);
    }
  }
  console.log('digest:', JSON.stringify({ tenants: tenants.length, sent }));
  return { tenants: tenants.length, sent };
};

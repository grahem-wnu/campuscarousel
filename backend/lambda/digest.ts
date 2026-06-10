// Lambda entry for the scheduled deadline-reminder digest (v2.1 F1, AsyncStack). EventBridge Scheduler
// invokes this hourly; runScheduledDigest gates to the configured send hour/weekday and emails each
// recipient whose digest is non-empty via SES. No event payload is used. CDK ships this as
// `index.handler` via Code.fromAsset(backend/dist/digest).

import { dataFromEnv } from '../shared/data/index.js';
import { sesSenderFromEnv } from '../shared/email/index.js';
import { runScheduledDigest } from '../modules/reminders/run.js';

export const handler = async (): Promise<{ sent: number; skipped?: string }> => {
  const from = process.env.REMINDER_SENDER_EMAIL;
  if (!from) {
    // Misconfiguration — fail loudly so the CloudWatch error alarm fires rather than silently no-op.
    throw new Error('digest: REMINDER_SENDER_EMAIL is not set');
  }
  const appUrl = process.env.APP_URL ?? 'https://keirasjourney.com';
  const result = await runScheduledDigest({
    data: dataFromEnv(),
    sender: sesSenderFromEnv(),
    from,
    appUrl,
    now: () => new Date(),
  });
  console.log('digest:', JSON.stringify(result));
  return { sent: result.sent, skipped: result.skipped };
};

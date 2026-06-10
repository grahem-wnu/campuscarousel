// Reminder-settings handlers (v2.1 F1): read/update the digest settings singleton and send an
// on-demand test email. The scheduled digest itself runs in the separate digest Lambda
// (backend/lambda/digest.ts) — these endpoints only configure and verify it. Built from injectable
// deps (in-memory data + fake sender + pinned clock in tests).

import { Errors, validate, validateBody, type Handler } from '../../shared/api/index.js';
import type { Data, ReminderRecipient } from '../../shared/data/index.js';
import { sesSenderFromEnv, type EmailSender } from '../../shared/email/index.js';
import { digestForRecipient } from './digest.js';
import { gatherForDigest } from './run.js';
import { sendTestBodySchema, settingsBodySchema } from './schema.js';
import { DEFAULT_SETTINGS, effectiveSettings } from './settings.js';

export interface ReminderHandlers {
  getSettings: Handler;
  putSettings: Handler;
  sendTest: Handler;
}

export interface ReminderDeps {
  getData: () => Data;
  sender?: EmailSender; // default: real SES sender
  from?: string; // verified SES sender address; default from env
  appUrl?: string; // deep-link base for the email; default from env
  now?: () => Date;
}

export function makeHandlers(deps: ReminderDeps): ReminderHandlers {
  const { getData } = deps;
  const sender = deps.sender ?? sesSenderFromEnv();
  const from = deps.from ?? process.env.REMINDER_SENDER_EMAIL ?? '';
  const appUrl = deps.appUrl ?? process.env.APP_URL ?? 'https://keirasjourney.com';
  const now = deps.now ?? (() => new Date());
  const today = (): string => now().toISOString().slice(0, 10);

  return {
    // GET /reminders/settings — current settings, or sensible defaults if none saved yet.
    getSettings: async () => {
      const stored = await getData().reminderSettings.get();
      return { status: 200, body: effectiveSettings(stored) };
    },

    // PUT /reminders/settings — patch any subset; recipients (when provided) replace the list.
    putSettings: async (ctx) => {
      const patch = validateBody(settingsBodySchema, ctx);
      const data = getData();
      const existing = await data.reminderSettings.get();
      const base = existing ?? DEFAULT_SETTINGS;
      const recipients: ReminderRecipient[] = (patch.recipients ?? base.recipients).map((r) => ({
        label: r.label,
        email: r.email,
        includePrivate: r.includePrivate ?? false,
      }));
      const saved = await data.reminderSettings.put({
        enabled: patch.enabled ?? base.enabled,
        cadence: patch.cadence ?? base.cadence,
        sendHourUTC: patch.sendHourUTC ?? base.sendHourUTC,
        weeklyDayOfWeek: patch.weeklyDayOfWeek ?? base.weeklyDayOfWeek,
        horizonDays: patch.horizonDays ?? base.horizonDays,
        recipients,
        lastSentAt: existing?.lastSentAt,
        notifiedEventIds: existing?.notifiedEventIds, // preserve the "never repeat" ledger
        updatedBy: ctx.requester.username,
      });
      return { status: 200, body: saved };
    },

    // POST /reminders/send-test — send the digest now (bypasses cadence). With { to }, sends a single
    // test to that address using the CALLER's privacy; otherwise sends to all configured recipients.
    sendTest: async (ctx) => {
      const body = validate(sendTestBodySchema, ctx.body ?? {});
      if (!from) throw Errors.conflict('Reminder sender email is not configured on the server.');
      const data = getData();
      const s = effectiveSettings(await data.reminderSettings.get());
      const g = await gatherForDigest(data);
      const todayIso = today();

      const targets: ReminderRecipient[] = body.to
        ? [{ label: 'there', email: body.to, includePrivate: ctx.requester.role === 'student' }]
        : s.recipients.filter((r) => r.email);
      if (targets.length === 0) {
        throw Errors.conflict('No reminder recipients configured — add an address or pass { "to": "..." }.');
      }

      const sentTo: string[] = [];
      for (const r of targets) {
        const d = digestForRecipient(g, r, todayIso, s.horizonDays, appUrl);
        await sender.send({ from, to: r.email, subject: `[Test] ${d.subject}`, text: d.text, html: d.html });
        sentTo.push(r.email);
      }
      return { status: 200, body: { sent: sentTo.length, recipients: sentTo } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: ReminderHandlers) {
  return [
    { method: 'GET' as const, path: '/reminders/settings', handler: h.getSettings },
    { method: 'PUT' as const, path: '/reminders/settings', handler: h.putSettings },
    { method: 'POST' as const, path: '/reminders/send-test', handler: h.sendTest },
  ];
}

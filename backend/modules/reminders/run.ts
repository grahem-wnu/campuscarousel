// Digest orchestration shared by the scheduled Lambda and the "send test" endpoint. `gatherForDigest`
// is the only part that touches the data client; the rest is pure (digest.ts). Deps are injected so
// tests run with in-memory data, a pinned clock, and a fake email sender.

import type { Data } from '../../shared/data/index.js';
import type { EmailSender } from '../../shared/email/index.js';
import { digestForRecipient, type GatheredData } from './digest.js';
import { shouldSendNow } from './settings.js';

/** Fetch everything the digest needs in one pass. Activities stay RAW — privacy is applied per recipient. */
export async function gatherForDigest(data: Data): Promise<GatheredData> {
  const [activities, goals, colleges, teas, scholarships, certifications, finaid] = await Promise.all([
    data.activities.list(),
    data.goals.list(),
    data.colleges.list(),
    data.teas.list(),
    data.scholarships.list(),
    data.certifications.list(),
    data.finaid.list(),
  ]);
  // Visits are sub-entities under COLLEGE#<id>; list per college and flatten (mirrors master-timeline).
  const visitLists = await Promise.all(colleges.map((c) => data.visits.list(c.collegeId)));
  return { activities, goals, colleges, teas, visits: visitLists.flat(), scholarships, certifications, finaid };
}

export interface DigestRunDeps {
  data: Data;
  sender: EmailSender;
  from: string;
  appUrl: string;
  now: () => Date;
}

export interface DigestRunResult {
  sent: number;
  recipients: string[];
  skipped?: string;
}

/**
 * Scheduled path: gated by `shouldSendNow`, then emails each recipient whose digest is non-empty.
 * Records `lastSentAt` only when at least one email went out (idempotency guard for retries).
 */
export async function runScheduledDigest(deps: DigestRunDeps): Promise<DigestRunResult> {
  const settings = await deps.data.reminderSettings.get();
  if (!settings) return { sent: 0, recipients: [], skipped: 'no-settings' };
  const now = deps.now();
  if (!shouldSendNow(settings, now)) return { sent: 0, recipients: [], skipped: 'not-scheduled' };

  const todayIso = now.toISOString().slice(0, 10);
  const g = await gatherForDigest(deps.data);

  // "Never repeat": exclude anything already emailed, and remember what we send this round.
  const notified = new Set(settings.notifiedEventIds ?? []);
  const newlyNotified = new Set<string>();
  const recipients: string[] = [];
  for (const r of settings.recipients) {
    if (!r.email) continue;
    const d = digestForRecipient(g, r, todayIso, settings.horizonDays, deps.appUrl, notified);
    if (d.model.count === 0) continue; // nothing NEW due for this person → don't email them
    await deps.sender.send({ from: deps.from, to: r.email, subject: d.subject, text: d.text, html: d.html });
    for (const section of d.model.sections) for (const item of section.items) newlyNotified.add(item.id);
    recipients.push(r.email);
  }
  if (recipients.length > 0) {
    await deps.data.reminderSettings.update({
      lastSentAt: now.toISOString(),
      notifiedEventIds: [...notified, ...newlyNotified],
    });
  }
  return { sent: recipients.length, recipients, skipped: recipients.length ? undefined : 'no-items' };
}

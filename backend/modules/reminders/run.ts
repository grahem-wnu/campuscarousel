// Digest orchestration shared by the scheduled Lambda and the "send test" endpoint. `gatherForDigest`
// is the only part that touches the data client; the rest is pure (digest.ts). Deps are injected so
// tests run with in-memory data, a pinned clock, and a fake email sender.

import type { College, Data } from '../../shared/data/index.js';
import type { EmailSender } from '../../shared/email/index.js';
import { runWithStudent } from '../../shared/tenant/index.js';
import { collegeDeadlineDate } from '../../shared/college-deadline.js';
import { digestForRecipient, type GatheredData } from './digest.js';
import { shouldSendNow } from './settings.js';

/** Project each college's application-deadline strings onto THIS student's senior-year cycle, so an
 *  underclassman (e.g. class of 2029) doesn't see the colleges' current published cycle as "overdue".
 *  collegeDeadlineDate is idempotent on an ISO date, so the downstream timeline builder keeps these.
 *  With no graduation year we leave the deadlines untouched (the stated-year behaviour). */
function projectDeadlines(colleges: College[], graduationYear?: number): College[] {
  if (!graduationYear) return colleges;
  const proj = (v?: string): string | undefined => (v ? collegeDeadlineDate(v, graduationYear) || undefined : undefined);
  return colleges.map((c) =>
    c.applicationDeadlines
      ? {
          ...c,
          applicationDeadlines: {
            earlyAction: proj(c.applicationDeadlines.earlyAction),
            regularDecision: proj(c.applicationDeadlines.regularDecision),
            programApp: proj(c.applicationDeadlines.programApp),
          },
        }
      : c,
  );
}

/** Fetch everything the digest needs for the CURRENT student in one pass. Activities stay RAW —
 *  privacy is applied per recipient. College deadlines are projected onto the student's own
 *  application cycle (from their profile graduationYear) so they aren't falsely flagged overdue. */
export async function gatherForDigest(data: Data): Promise<GatheredData> {
  const [activities, goals, colleges, exams, scholarships, certifications, finaid, profile] = await Promise.all([
    data.activities.list(),
    data.goals.list(),
    data.colleges.list(),
    data.exams.list(),
    data.scholarships.list(),
    data.certifications.list(),
    data.finaid.list(),
    data.studentProfile.get(),
  ]);
  // Visits are sub-entities under COLLEGE#<id>; list per college and flatten (mirrors master-timeline).
  const visitLists = await Promise.all(colleges.map((c) => data.visits.list(c.collegeId)));
  return {
    activities,
    goals,
    colleges: projectDeadlines(colleges, profile?.graduationYear),
    exams,
    visits: visitLists.flat(),
    scholarships,
    certifications,
    finaid,
  };
}

const EMPTY: GatheredData = {
  activities: [], goals: [], colleges: [], exams: [], visits: [], scholarships: [], certifications: [], finaid: [],
};

const mergeGathered = (a: GatheredData, b: GatheredData): GatheredData => ({
  activities: [...a.activities, ...b.activities],
  goals: [...a.goals, ...b.goals],
  colleges: [...a.colleges, ...b.colleges],
  exams: [...a.exams, ...b.exams],
  visits: [...a.visits, ...b.visits],
  scholarships: [...a.scholarships, ...b.scholarships],
  certifications: [...a.certifications, ...b.certifications],
  finaid: [...a.finaid, ...b.finaid],
});

/**
 * The family digest spans ALL the family's children (multi-student): gather each child's per-child data
 * inside that child's context, then merge into one set so a single email covers the whole family. With
 * no roster yet (e.g. tests, or a family with legacy un-scoped data) it falls back to a single gather in
 * the current context. The caller must already be inside the tenant context (the digest Lambda sets it).
 */
export async function gatherForFamily(data: Data): Promise<GatheredData> {
  const students = await data.students.list();
  if (students.length === 0) return gatherForDigest(data);
  let merged = EMPTY;
  for (const s of students) {
    const perChild = await runWithStudent(s.studentId, () => gatherForDigest(data));
    merged = mergeGathered(merged, perChild);
  }
  return merged;
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
  const g = await gatherForFamily(deps.data);

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

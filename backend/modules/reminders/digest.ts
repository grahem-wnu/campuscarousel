// Pure digest assembly + rendering for the deadline-reminder email (v2.1 F1). It reuses the
// master-timeline aggregation (buildEvents/upcoming) as the single source of truth for "what's due",
// then groups and renders it as text + HTML. PRIVACY: items sourced from Keira's PRIVATE activities
// are ALWAYS excluded from every digest — an outbound email is never a place private content may
// appear, so there is deliberately no per-recipient opt-in. AWS-free so it unit-tests for real; the
// Lambda/handler just gather data and hand it in.

import type {
  Activity,
  Certification,
  College,
  FinAidItem,
  Goal,
  ReminderRecipient,
  Scholarship,
  ExamScore,
  Visit,
} from '../../shared/data/index.js';
import {
  buildEvents,
  upcoming,
  type TimelineEvent,
  type UpcomingEvent,
  type UpcomingGroup,
} from '../master-timeline/events.js';

/** Everything the digest needs, fetched once; activities are kept RAW so privacy is applied per recipient. */
export interface GatheredData {
  activities: Activity[];
  goals: Goal[];
  colleges: College[];
  exams: ExamScore[];
  visits: Visit[];
  scholarships: Scholarship[];
  certifications: Certification[];
  finaid: FinAidItem[];
}

/** Build the event stream for the digest. Private-sourced items are ALWAYS dropped — they never
 *  belong in an outbound email, regardless of who the recipient is. */
export function eventsFor(g: GatheredData): TimelineEvent[] {
  const activities = g.activities.filter((a) => a.visibility !== 'private');
  return buildEvents({
    activities,
    goals: g.goals,
    colleges: g.colleges,
    exams: g.exams,
    visits: g.visits,
    scholarships: g.scholarships,
    certifications: g.certifications,
    finaid: g.finaid,
  });
}

const GROUP_ORDER: UpcomingGroup[] = ['overdue', 'this-week', 'next-week', 'this-month', 'later'];
const GROUP_LABEL: Record<UpcomingGroup, string> = {
  overdue: 'Overdue',
  'this-week': 'This week',
  'next-week': 'Next week',
  'this-month': 'This month',
  later: 'Later',
};
const SOURCE_LABEL: Record<string, string> = {
  activity: 'Activity',
  goal: 'Goal',
  college: 'Application',
  exam: 'Exam',
  visit: 'Campus visit',
  scholarship: 'Scholarship',
  certification: 'Certification',
  finaid: 'Financial aid',
};

export interface DigestSection {
  group: UpcomingGroup;
  label: string;
  items: UpcomingEvent[];
}
export interface DigestModel {
  count: number;
  overdueCount: number;
  sections: DigestSection[];
}

/** Group an upcoming-event list into ordered, non-empty sections. */
export function buildDigestModel(events: readonly UpcomingEvent[]): DigestModel {
  const sections = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    items: events.filter((e) => e.group === group),
  })).filter((s) => s.items.length > 0);
  return {
    count: events.length,
    overdueCount: events.filter((e) => e.group === 'overdue').length,
    sections,
  };
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

function whenLabel(days: number): string {
  if (days < 0) return `${-days} day${plural(-days)} ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function digestSubject(m: DigestModel): string {
  if (m.count === 0) return "Campus Carousel — nothing due right now";
  if (m.overdueCount > 0) {
    return `Campus Carousel — ${m.overdueCount} overdue, ${m.count} item${plural(m.count)} to watch`;
  }
  return `Campus Carousel — ${m.count} upcoming deadline${plural(m.count)}`;
}

export interface RenderOpts {
  recipientLabel: string;
  appUrl: string;
  horizonDays: number;
}

export function renderText(m: DigestModel, opts: RenderOpts): string {
  const lines: string[] = [`Hi ${opts.recipientLabel},`, ''];
  if (m.count === 0) {
    lines.push(
      `Nothing is due in the next ${opts.horizonDays} days — you're all caught up. Nice work.`,
      '',
      `Open Campus Carousel: ${opts.appUrl}`,
    );
    return lines.join('\n');
  }
  lines.push("Here's what needs attention on Campus Carousel:", '');
  for (const s of m.sections) {
    lines.push(`${s.label}`);
    for (const it of s.items) {
      lines.push(`  • [${sourceLabel(it.source)}] ${it.title} — ${it.date} (${whenLabel(it.daysUntil)})`);
    }
    lines.push('');
  }
  lines.push(`Open Campus Carousel: ${opts.appUrl}`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderHtml(m: DigestModel, opts: RenderOpts): string {
  const head = `<p>Hi ${escapeHtml(opts.recipientLabel)},</p>`;
  const foot = `<p style="margin-top:24px"><a href="${escapeHtml(opts.appUrl)}">Open Campus Carousel</a></p>`;
  if (m.count === 0) {
    return `<div style="font-family:system-ui,Arial,sans-serif;line-height:1.5">${head}<p>Nothing is due in the next ${opts.horizonDays} days — you're all caught up. Nice work.</p>${foot}</div>`;
  }
  const sections = m.sections
    .map((s) => {
      const items = s.items
        .map(
          (it) =>
            `<li><strong>[${escapeHtml(sourceLabel(it.source))}]</strong> ${escapeHtml(it.title)} — ${escapeHtml(it.date)} <em>(${escapeHtml(whenLabel(it.daysUntil))})</em></li>`,
        )
        .join('');
      const color = s.group === 'overdue' ? '#b91c1c' : '#111827';
      return `<h3 style="color:${color};margin:16px 0 4px">${escapeHtml(s.label)}</h3><ul style="margin:0 0 8px 0;padding-left:20px">${items}</ul>`;
    })
    .join('');
  return `<div style="font-family:system-ui,Arial,sans-serif;line-height:1.5">${head}<p>Here's what needs attention on Campus Carousel:</p>${sections}${foot}</div>`;
}

export interface RecipientDigest {
  recipient: ReminderRecipient;
  subject: string;
  text: string;
  html: string;
  model: DigestModel;
}

/**
 * Build the rendered digest for a single recipient. `excludeIds` (event ids already emailed in a
 * prior digest) are filtered out so a deadline is never sent twice — see ReminderSettings.notifiedEventIds.
 */
export function digestForRecipient(
  g: GatheredData,
  recipient: ReminderRecipient,
  todayIso: string,
  horizonDays: number,
  appUrl: string,
  excludeIds: ReadonlySet<string> = new Set(),
): RecipientDigest {
  const fresh = eventsFor(g).filter((e) => !excludeIds.has(e.id));
  // Activities are logs of things already done, not deadlines — so they should never read as
  // "overdue". Keep today/upcoming ones (e.g. a planned shift) and drop past activity logs.
  const events = upcoming(fresh, todayIso, horizonDays).filter(
    (e) => !(e.source === 'activity' && e.group === 'overdue'),
  );
  const model = buildDigestModel(events);
  const opts: RenderOpts = { recipientLabel: recipient.label, appUrl, horizonDays };
  return {
    recipient,
    model,
    subject: digestSubject(model),
    text: renderText(model, opts),
    html: renderHtml(model, opts),
  };
}

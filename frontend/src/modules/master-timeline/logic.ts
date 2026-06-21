// Pure, framework-free helpers for the Master Timeline UI. Unit-tested in the node environment.

import type { CollegeDeadline, CollegePlan, EventSource, TimelineEvent, UpcomingEvent, UpcomingGroup } from './types';

/** Source color coding mapped to the FROZEN design-system token scales only (no raw hex, no
 *  non-existent `info` scale). The spec's 7 ideal hues (blue/green/red/yellow/purple/orange/pink)
 *  exceed the 5 token hues, so visits + certs reuse distinct shades of existing scales; a true
 *  purple/pink would need new token scales (a design-system change, out of this module's lane). */
export const SOURCE_DOT: Record<EventSource, string> = {
  activity: 'bg-primary-500', // blue-green
  goal: 'bg-success-500', // green
  college: 'bg-error-500', // red (application deadlines)
  teas: 'bg-warn-500', // yellow (test dates)
  visit: 'bg-primary-700', // deep teal (distinct from activity)
  scholarship: 'bg-secondary-500', // terracotta/orange
  certification: 'bg-ink-400', // neutral
};
export const SOURCE_LABEL: Record<EventSource, string> = {
  activity: 'Activity',
  goal: 'Goal',
  college: 'Application',
  teas: 'Test',
  visit: 'Visit',
  scholarship: 'Scholarship',
  certification: 'Certification',
};

export const GROUP_LABEL: Record<UpcomingGroup, string> = {
  overdue: 'Overdue',
  'this-week': 'This week',
  'next-week': 'Next week',
  'this-month': 'This month',
  later: 'Later',
};
export const GROUP_ORDER: UpcomingGroup[] = ['overdue', 'this-week', 'next-week', 'this-month', 'later'];

/** Group upcoming events by their bucket, preserving the soonest-first order within each. */
export function groupUpcoming(events: readonly UpcomingEvent[]): { group: UpcomingGroup; events: UpcomingEvent[] }[] {
  return GROUP_ORDER.map((group) => ({ group, events: events.filter((e) => e.group === group) })).filter((g) => g.events.length > 0);
}

export function countdownLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  if (daysUntil < 45) return `in ${daysUntil}d`;
  if (daysUntil < 365) return `in ${Math.round(daysUntil / 30)} mo`;
  const years = daysUntil / 365;
  return `in ~${years < 2 ? years.toFixed(1) : Math.round(years)} yr`;
}

/** Events keyed by ISO date (for a calendar grid). */
export function eventsByDate(events: readonly TimelineEvent[]): Record<string, TimelineEvent[]> {
  const out: Record<string, TimelineEvent[]> = {};
  for (const e of events) (out[e.date] ??= []).push(e);
  return out;
}

/** A 42-cell (6-week) Sunday-start month grid; `month` is 0-based. UTC-based for determinism. */
export function monthGrid(year: number, month: number): { iso: string; inMonth: boolean }[] {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const start = Date.UTC(year, month, 1 - firstDow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    return { iso: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month };
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** "2029-09-15" → "Sep 15, 2029" (string-parsed, so no timezone shift). Returns input if not ISO. */
export function formatLongDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// --- College application plans (plain-language collapse of per-deadline rows) -------------------
// The backend emits one event per deadline TYPE (early action / regular decision / program app), so a
// single college spreads across 2-3 jargon rows. These helpers collapse them into one plan per
// college, translate the jargon, and estimate when a decision comes back (families want both anchors:
// when to submit AND when they'll hear). Estimates are rough offsets from the submit date — always
// shown with a "~" — until real decision dates are hydrated.

const DEADLINE_LABEL: Record<string, string> = {
  'early-action': 'Early Action',
  'early-decision': 'Early Decision',
  'regular-decision': 'Regular Decision',
  'program-app': 'Program Application',
};
/** Typical gap from a submit deadline to when decisions are released, by deadline type (days). */
const DECISION_OFFSET_DAYS: Record<string, number> = {
  'early-action': 45, // Nov 1 submit -> ~mid-Dec
  'early-decision': 45,
  'regular-decision': 84, // ~Jan 1 submit -> ~late March
  'program-app': 60,
};

export function deadlineTypeLabel(type: string): string {
  return DEADLINE_LABEL[type] ?? 'Application';
}

/** Estimated decision-release ISO date for a submit deadline of a given type. undefined when the
 *  type isn't one we estimate (so the UI omits the "hear back" line rather than guessing). */
export function decisionEstimate(type: string, submitISO: string): string | undefined {
  const off = DECISION_OFFSET_DAYS[type];
  if (off === undefined) return undefined;
  const m = submitISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + off);
  return d.toISOString().slice(0, 10);
}

/** Collapse college deadline events into one plan per college: each option as apply-by + estimated
 *  hear-back, deadlines sorted soonest-first, colleges ordered by their soonest deadline. */
export function collegePlans(events: readonly UpcomingEvent[]): CollegePlan[] {
  const byKey = new Map<string, CollegePlan>();
  for (const e of events) {
    if (e.source !== 'college') continue;
    const key = e.collegeId ?? e.title;
    // Titles come in as "Auburn University — early action"; strip the " — <type>" suffix (any dash).
    const name = e.title.split(/\s[—–-]\s/)[0]?.trim() || e.title;
    let plan = byKey.get(key);
    if (!plan) {
      plan = { collegeId: e.collegeId, name, logoUrl: e.logoUrl, website: e.website, deadlines: [], soonestDaysUntil: e.daysUntil };
      byKey.set(key, plan);
    }
    const deadline: CollegeDeadline = {
      type: e.type,
      label: deadlineTypeLabel(e.type),
      submitDate: e.date,
      submitDaysUntil: e.daysUntil,
    };
    const decision = decisionEstimate(e.type, e.date);
    if (decision) deadline.decisionDate = decision;
    plan.deadlines.push(deadline);
    plan.soonestDaysUntil = Math.min(plan.soonestDaysUntil, e.daysUntil);
  }
  for (const p of byKey.values()) p.deadlines.sort((a, b) => a.submitDaysUntil - b.submitDaysUntil);
  return [...byKey.values()].sort((a, b) => a.soonestDaysUntil - b.soonestDaysUntil);
}

/** The page a timeline event links to — the thing you'd act on. College events deep-link to that
 *  college's page; other sources go to their module. */
export function eventLink(e: Pick<TimelineEvent, 'source' | 'collegeId'>): string {
  switch (e.source) {
    case 'college':
      return e.collegeId ? `/colleges/${e.collegeId}` : '/colleges';
    case 'teas':
      return '/exams';
    case 'visit':
      return '/visits';
    case 'scholarship':
      return '/scholarships';
    case 'certification':
      return '/certifications';
    case 'goal':
      return '/goals';
    case 'activity':
      return '/journal';
    default:
      return '/';
  }
}

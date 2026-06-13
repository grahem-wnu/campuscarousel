// Pure, framework-free helpers for the Master Timeline UI. Unit-tested in the node environment.

import type { EventSource, TimelineEvent, UpcomingEvent, UpcomingGroup } from './types';

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

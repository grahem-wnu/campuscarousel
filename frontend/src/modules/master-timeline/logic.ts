// Pure, framework-free helpers for the Master Timeline UI. Unit-tested in the node environment.

import type { EventSource, TimelineEvent, UpcomingEvent, UpcomingGroup } from './types';

/** Source color coding (spec): activities blue, goals green, app deadlines red, test dates yellow,
 *  visits purple, scholarship deadlines orange, cert expirations pink. */
export const SOURCE_DOT: Record<EventSource, string> = {
  activity: 'bg-info-500',
  goal: 'bg-success-500',
  college: 'bg-error-500',
  teas: 'bg-warn-500',
  visit: 'bg-[#9b6dff]',
  scholarship: 'bg-secondary-500',
  certification: 'bg-[#e879b9]',
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
  return `in ${daysUntil}d`;
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

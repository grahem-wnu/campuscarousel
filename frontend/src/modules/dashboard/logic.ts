// Pure, framework-free helpers for the Dashboard UI. Unit-tested in the node environment.

import type { BadgeTone, IconName } from '../../shared/ui';
import type { Deadline } from './types';

/** Urgency tone for a deadline countdown. */
export function deadlineTone(daysUntil: number): BadgeTone {
  if (daysUntil <= 7) return 'error';
  if (daysUntil <= 30) return 'warn';
  return 'neutral';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2028-10-01" → "Oct 1, 2028". Parsed from the string parts (no Date, so no timezone shift);
 *  returns the input unchanged if it isn't an ISO date. */
export function formatDeadlineDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, year, mm, dd] = m;
  const monthIdx = Number(mm) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${MONTHS[monthIdx]} ${Number(dd)}, ${year}`;
}

/** Short, non-wrapping deadline label: relative for the near term, a compact human date beyond. */
export function deadlineLabel(d: Deadline): string {
  if (d.daysUntil === 0) return 'today';
  if (d.daysUntil === 1) return 'tomorrow';
  if (d.daysUntil <= 45) return `in ${d.daysUntil}d`;
  return formatDeadlineDate(d.date);
}

export const SOURCE_TONE: Record<Deadline['source'], BadgeTone> = {
  college: 'error',
  goal: 'success',
  scholarship: 'warn',
  certification: 'primary',
};

/** Icon per deadline source — a compact type indicator (no wide text tag). */
export const SOURCE_ICON: Record<Deadline['source'], IconName> = {
  college: 'school',
  goal: 'goal',
  scholarship: 'scholarship',
  certification: 'certificate',
};

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

export function gpaText(weighted: number | null, unweighted: number | null): string {
  if (weighted === null) return '—';
  return unweighted !== null && unweighted !== weighted ? `${weighted.toFixed(2)} (uw ${unweighted.toFixed(2)})` : weighted.toFixed(2);
}

export const READINESS_TONE: Record<string, BadgeTone> = {
  strong: 'success',
  competitive: 'primary',
  'needs-work': 'warn',
  'insufficient-data': 'neutral',
};

/** Human text for the readiness badge — the raw enum ("insufficient-data") is not user-facing copy. */
export const READINESS_LABEL: Record<string, string> = {
  strong: 'Strong',
  competitive: 'Competitive',
  'needs-work': 'Needs work',
  'insufficient-data': 'Not enough data yet',
};

export function readinessLabel(level: string): string {
  return READINESS_LABEL[level] ?? level;
}

/** Category → hours rows, descending. */
export function categoryRows(hoursByCategory: Record<string, number>): { category: string; hours: number }[] {
  return Object.entries(hoursByCategory)
    .map(([category, hours]) => ({ category, hours }))
    .sort((a, b) => b.hours - a.hours);
}

/** Total tracked colleges across all statuses. */
export function totalColleges(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

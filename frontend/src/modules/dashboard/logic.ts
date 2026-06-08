// Pure, framework-free helpers for the Dashboard UI. Unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type { Deadline } from './types';

/** Urgency tone for a deadline countdown. */
export function deadlineTone(daysUntil: number): BadgeTone {
  if (daysUntil <= 7) return 'error';
  if (daysUntil <= 30) return 'warn';
  return 'neutral';
}

export function deadlineLabel(d: Deadline): string {
  if (d.daysUntil === 0) return 'today';
  if (d.daysUntil === 1) return 'tomorrow';
  if (d.daysUntil <= 45) return `in ${d.daysUntil}d`;
  return d.date;
}

export const SOURCE_TONE: Record<Deadline['source'], BadgeTone> = {
  college: 'error',
  goal: 'success',
  scholarship: 'warn',
  certification: 'primary',
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

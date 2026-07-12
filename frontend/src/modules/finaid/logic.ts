// Pure helpers for the Financial Aid Center — labels + deadline countdowns.

import type { FinAidKind, FinAidStatus } from './types';

export const KIND_LABELS: Record<FinAidKind, string> = {
  fafsa: 'FAFSA',
  'css-profile': 'CSS Profile',
  'state-aid': 'State aid',
  'institutional-aid': 'Institutional aid',
  loan: 'Loan',
  'award-letter': 'Award letter',
  other: 'Other',
};

export const STATUS_LABELS: Record<FinAidStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  submitted: 'Submitted',
  received: 'Received',
  'n/a': 'N/A',
};

export const KINDS = Object.keys(KIND_LABELS) as FinAidKind[];
export const STATUSES = Object.keys(STATUS_LABELS) as FinAidStatus[];

export const kindLabel = (k: FinAidKind): string => KIND_LABELS[k] ?? k;
export const statusLabel = (s: FinAidStatus): string => STATUS_LABELS[s] ?? s;

/** Whole days from `todayIso` to `dateIso` (negative = overdue), or null if unparseable. */
export function daysUntil(dateIso: string, todayIso: string): number | null {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  const base = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(base)) return null;
  return Math.round((t - base) / 86_400_000);
}

/** Human deadline label: "in 12 days", "today", "3 days ago". */
export function countdownLabel(dateIso: string, todayIso: string): string {
  const d = daysUntil(dateIso, todayIso);
  if (d === null) return dateIso;
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} ago`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

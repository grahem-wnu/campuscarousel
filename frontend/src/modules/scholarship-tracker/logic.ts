// Pure presentation logic for the Scholarship Tracker — type/status metadata, deadline urgency
// (color-coding), money formatting, sorting, filtering, and what-if budget math. No React/network,
// so it unit-tests directly. `today` is injected wherever "now" matters, for deterministic tests.

import type { BadgeTone } from '../../shared/ui';
import type { Scholarship, ScholarshipType, Status } from './types';

export const TYPE_META: Record<ScholarshipType, string> = {
  merit: 'Merit',
  'need-based': 'Need-based',
  'major-specific': 'Major-specific',
  'community-service': 'Community Service',
  diversity: 'Diversity',
  'state-specific': 'State-specific',
  organization: 'Organization',
  other: 'Other',
};

export const STATUS_META: Record<Status, { label: string; tone: BadgeTone }> = {
  discovered: { label: 'Discovered', tone: 'neutral' },
  researching: { label: 'Researching', tone: 'info' },
  preparing: { label: 'Preparing', tone: 'info' },
  applied: { label: 'Applied', tone: 'primary' },
  awarded: { label: 'Awarded', tone: 'success' },
  denied: { label: 'Denied', tone: 'error' },
  expired: { label: 'Expired', tone: 'neutral' },
};

const MS_PER_DAY = 86_400_000;

/** Whole days from `today` until `deadline` (negative = past). Both are YYYY-MM-DD. */
export function daysUntil(deadline: string, today: string): number {
  const d = Date.parse(`${deadline}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.round((d - t) / MS_PER_DAY);
}

export interface DeadlineInfo {
  label: string;
  tone: BadgeTone;
  days: number | null;
}

/** Color-code a deadline: past → error/"Passed", <30d → error, <90d → warn, else neutral. */
export function deadlineInfo(deadline: string | undefined, today: string): DeadlineInfo {
  if (!deadline) return { label: 'No deadline', tone: 'neutral', days: null };
  const days = daysUntil(deadline, today);
  if (days < 0) return { label: `Passed (${deadline})`, tone: 'error', days };
  if (days === 0) return { label: 'Due today', tone: 'error', days };
  if (days < 30) return { label: `${days}d left`, tone: 'error', days };
  if (days < 90) return { label: `${days}d left`, tone: 'warn', days };
  return { label: `Due ${deadline}`, tone: 'neutral', days };
}

/** Money as whole-dollar USD; falls back to amountDescription text when there's no number. */
export function formatAmount(amount: number | undefined, fallback?: string): string {
  if (typeof amount === 'number') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return fallback?.trim() ? fallback : '—';
}

export type SortKey = 'deadline' | 'amount' | 'status';

const STATUS_ORDER: Record<Status, number> = {
  awarded: 0,
  applied: 1,
  preparing: 2,
  researching: 3,
  discovered: 4,
  denied: 5,
  expired: 6,
};

/** Sort a copy of the list. Deadline: soonest first (missing last). Amount: largest first. */
export function sortScholarships(list: Scholarship[], key: SortKey, today: string): Scholarship[] {
  const copy = [...list];
  if (key === 'amount') {
    copy.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
  } else if (key === 'status') {
    copy.sort((a, b) => (STATUS_ORDER[a.status ?? 'discovered'] - STATUS_ORDER[b.status ?? 'discovered']));
  } else {
    copy.sort((a, b) => {
      const da = a.applicationDeadline ? daysUntil(a.applicationDeadline, today) : Number.POSITIVE_INFINITY;
      const db = b.applicationDeadline ? daysUntil(b.applicationDeadline, today) : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }
  return copy;
}

/** Free-text search over name/provider/notes (case-insensitive). */
export function filterBySearch(list: Scholarship[], search: string): Scholarship[] {
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.provider ?? '').toLowerCase().includes(q) ||
      (s.notes ?? '').toLowerCase().includes(q),
  );
}

/**
 * "What-if" affordability: starting budget, money already awarded, and a hypothetical extra award.
 * Returns the adjusted out-of-pocket figures. `budget` may be null (no budget set).
 */
export function whatIf(
  budget: number | null,
  awarded: number,
  hypotheticalExtra: number,
): { adjustedNow: number | null; adjustedWithHypothetical: number | null; covered: number } {
  const extra = Math.max(0, hypotheticalExtra);
  return {
    adjustedNow: budget === null ? null : budget - awarded,
    adjustedWithHypothetical: budget === null ? null : budget - awarded - extra,
    covered: awarded + extra,
  };
}

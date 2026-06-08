// Pure aggregation for GET /activities/summary. Kept separate from the handler so it is trivially
// unit-tested. Callers MUST pass an already visibility-filtered list (private entries excluded for
// non-students) — this function does no filtering of its own.

import type { Activity } from '../../shared/data/index.js';

export interface ActivitySummary {
  totalCount: number;
  totalHours: number;
  /** Sum of `hours` per category (categories with no hours still appear with 0 if present). */
  hoursByCategory: Record<string, number>;
  /** Count of entries per category. */
  countsByCategory: Record<string, number>;
  /** Count of entries per `YYYY-MM` month, for the over-time chart. */
  countsByMonth: Record<string, number>;
}

const monthOf = (isoDate: string): string => isoDate.slice(0, 7); // YYYY-MM

export function summarize(activities: readonly Activity[]): ActivitySummary {
  const hoursByCategory: Record<string, number> = {};
  const countsByCategory: Record<string, number> = {};
  const countsByMonth: Record<string, number> = {};
  let totalHours = 0;

  for (const a of activities) {
    const hours = typeof a.hours === 'number' ? a.hours : 0;
    totalHours += hours;
    hoursByCategory[a.category] = (hoursByCategory[a.category] ?? 0) + hours;
    countsByCategory[a.category] = (countsByCategory[a.category] ?? 0) + 1;
    if (a.date) {
      const m = monthOf(a.date);
      countsByMonth[m] = (countsByMonth[m] ?? 0) + 1;
    }
  }

  return {
    totalCount: activities.length,
    totalHours,
    hoursByCategory,
    countsByCategory,
    countsByMonth,
  };
}

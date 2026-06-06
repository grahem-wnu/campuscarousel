// Pure summary + budget-impact math for GET /scholarships/summary. No data-layer or AWS access, so
// it unit-tests directly. The budget singleton (may be absent) is passed in.

import type { Budget, Scholarship } from '../../shared/data/index.js';

/** Statuses that count as "still in play" for potential value (not yet lost). */
const ACTIVE_FOR_POTENTIAL = new Set(['discovered', 'researching', 'preparing', 'applied', 'awarded']);

export interface ScholarshipSummary {
  totalTracked: number;
  countsByStatus: Record<string, number>;
  /** Sum of `amount` for scholarships still in play (excludes denied/expired). */
  totalPotential: number;
  /** Sum of `awardedAmount` for scholarships with status `awarded`. */
  totalAwarded: number;
  budget: {
    /** From the budget singleton; null when no budget has been set. */
    totalBudget: number | null;
    /** totalBudget reduced by awarded scholarship money; null when no budget set. */
    adjustedRemaining: number | null;
  };
}

export function summarize(scholarships: Scholarship[], budget: Budget | null): ScholarshipSummary {
  const countsByStatus: Record<string, number> = {};
  let totalPotential = 0;
  let totalAwarded = 0;

  for (const s of scholarships) {
    const status = s.status ?? 'discovered';
    countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
    if (ACTIVE_FOR_POTENTIAL.has(status) && typeof s.amount === 'number') {
      totalPotential += s.amount;
    }
    if (status === 'awarded' && typeof s.awardedAmount === 'number') {
      totalAwarded += s.awardedAmount;
    }
  }

  const totalBudget = budget && typeof budget.totalBudget === 'number' ? budget.totalBudget : null;
  return {
    totalTracked: scholarships.length,
    countsByStatus,
    totalPotential,
    totalAwarded,
    budget: {
      totalBudget,
      adjustedRemaining: totalBudget === null ? null : totalBudget - totalAwarded,
    },
  };
}

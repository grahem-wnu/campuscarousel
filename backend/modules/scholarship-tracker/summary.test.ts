import { describe, expect, it } from 'vitest';
import type { Budget, Scholarship } from '../../shared/data/index.js';
import { summarize } from './summary.js';

const scholarship = (over: Partial<Scholarship> = {}): Scholarship => ({
  scholarshipId: Math.random().toString(36).slice(2),
  name: 'S',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

describe('summarize', () => {
  it('counts by status and sums potential (active only) + awarded', () => {
    const s = summarize(
      [
        scholarship({ status: 'discovered', amount: 1000 }),
        scholarship({ status: 'applied', amount: 2000 }),
        scholarship({ status: 'awarded', amount: 3000, awardedAmount: 2500 }),
        scholarship({ status: 'denied', amount: 9000 }), // excluded from potential
        scholarship({ status: 'expired', amount: 9000 }), // excluded from potential
      ],
      null,
    );
    expect(s.totalTracked).toBe(5);
    expect(s.totalPotential).toBe(6000); // 1000 + 2000 + 3000 (awarded amount still "in play")
    expect(s.totalAwarded).toBe(2500);
    expect(s.countsByStatus).toMatchObject({ discovered: 1, applied: 1, awarded: 1, denied: 1, expired: 1 });
  });

  it('reports null budget figures when no budget is set', () => {
    const s = summarize([scholarship({ status: 'awarded', awardedAmount: 5000 })], null);
    expect(s.budget.totalBudget).toBeNull();
    expect(s.budget.adjustedRemaining).toBeNull();
  });

  it('adjusts the budget by awarded money when a budget exists', () => {
    const budget: Budget = { totalBudget: 200_000, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const s = summarize(
      [
        scholarship({ status: 'awarded', awardedAmount: 12_000 }),
        scholarship({ status: 'awarded', awardedAmount: 3_000 }),
        scholarship({ status: 'applied', amount: 5_000 }),
      ],
      budget,
    );
    expect(s.budget.totalBudget).toBe(200_000);
    expect(s.totalAwarded).toBe(15_000);
    expect(s.budget.adjustedRemaining).toBe(185_000);
  });

  it('defaults a missing status to discovered', () => {
    const s = summarize([scholarship({ amount: 100 })], null);
    expect(s.countsByStatus.discovered).toBe(1);
    expect(s.totalPotential).toBe(100);
  });
});

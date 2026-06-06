import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  deadlineInfo,
  filterBySearch,
  formatAmount,
  sortScholarships,
  whatIf,
} from './logic';
import type { Scholarship } from './types';

const s = (over: Partial<Scholarship> = {}): Scholarship => ({
  scholarshipId: Math.random().toString(36).slice(2),
  name: 'S',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

const TODAY = '2026-06-01';

describe('daysUntil', () => {
  it('computes whole-day differences, negative for past', () => {
    expect(daysUntil('2026-06-08', TODAY)).toBe(7);
    expect(daysUntil('2026-06-01', TODAY)).toBe(0);
    expect(daysUntil('2026-05-25', TODAY)).toBe(-7);
  });
});

describe('deadlineInfo color-coding', () => {
  it('no deadline → neutral', () => {
    expect(deadlineInfo(undefined, TODAY)).toMatchObject({ tone: 'neutral', days: null });
  });
  it('past → error "Passed"', () => {
    expect(deadlineInfo('2026-05-01', TODAY)).toMatchObject({ tone: 'error' });
  });
  it('<30d → error (red)', () => {
    expect(deadlineInfo('2026-06-20', TODAY).tone).toBe('error');
  });
  it('<90d → warn (yellow)', () => {
    expect(deadlineInfo('2026-08-01', TODAY).tone).toBe('warn');
  });
  it('far → neutral', () => {
    expect(deadlineInfo('2026-12-01', TODAY).tone).toBe('neutral');
  });
});

describe('formatAmount', () => {
  it('formats whole-dollar USD', () => {
    expect(formatAmount(5000)).toBe('$5,000');
    expect(formatAmount(0)).toBe('$0');
  });
  it('falls back to the description, then a dash', () => {
    expect(formatAmount(undefined, 'Varies')).toBe('Varies');
    expect(formatAmount(undefined)).toBe('—');
  });
});

describe('sortScholarships', () => {
  it('deadline: soonest first, missing last', () => {
    const out = sortScholarships(
      [s({ name: 'far', applicationDeadline: '2026-12-01' }), s({ name: 'none' }), s({ name: 'soon', applicationDeadline: '2026-06-10' })],
      'deadline',
      TODAY,
    );
    expect(out.map((x) => x.name)).toEqual(['soon', 'far', 'none']);
  });
  it('amount: largest first, missing last', () => {
    const out = sortScholarships([s({ name: 'a', amount: 100 }), s({ name: 'b' }), s({ name: 'c', amount: 5000 })], 'amount', TODAY);
    expect(out.map((x) => x.name)).toEqual(['c', 'a', 'b']);
  });
  it('status: awarded before discovered', () => {
    const out = sortScholarships([s({ name: 'd', status: 'discovered' }), s({ name: 'a', status: 'awarded' })], 'status', TODAY);
    expect(out.map((x) => x.name)).toEqual(['a', 'd']);
  });
});

describe('filterBySearch', () => {
  it('matches name/provider/notes case-insensitively', () => {
    const list = [s({ name: 'Future Nurses' }), s({ name: 'X', provider: 'ANA' }), s({ name: 'Y', notes: 'rural focus' })];
    expect(filterBySearch(list, 'nurse')).toHaveLength(1);
    expect(filterBySearch(list, 'ana')).toHaveLength(1);
    expect(filterBySearch(list, 'RURAL')).toHaveLength(1);
    expect(filterBySearch(list, '')).toHaveLength(3);
  });
});

describe('whatIf affordability', () => {
  it('adjusts budget by awarded + hypothetical', () => {
    expect(whatIf(200_000, 15_000, 10_000)).toEqual({
      adjustedNow: 185_000,
      adjustedWithHypothetical: 175_000,
      covered: 25_000,
    });
  });
  it('returns null adjustments when no budget set', () => {
    expect(whatIf(null, 5_000, 1_000)).toMatchObject({ adjustedNow: null, adjustedWithHypothetical: null, covered: 6_000 });
  });
  it('ignores negative hypothetical', () => {
    expect(whatIf(100, 10, -50).covered).toBe(10);
  });
});

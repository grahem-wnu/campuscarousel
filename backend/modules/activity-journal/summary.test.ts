import { describe, expect, it } from 'vitest';
import type { Activity } from '../../shared/data/index.js';
import { summarize } from './summary.js';

const act = (over: Partial<Activity>): Activity => ({
  activityId: 'a',
  userId: 'keira',
  date: '2026-01-15',
  category: 'volunteer',
  title: 't',
  visibility: 'family',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('summarize', () => {
  it('aggregates hours and counts by category and month', () => {
    const s = summarize([
      act({ category: 'volunteer', hours: 3, date: '2026-01-10' }),
      act({ category: 'volunteer', hours: 2, date: '2026-01-20' }),
      act({ category: 'clinical', hours: 4, date: '2026-02-01' }),
      act({ category: 'academic', date: '2026-02-15' }), // no hours
    ]);
    expect(s.totalCount).toBe(4);
    expect(s.totalHours).toBe(9);
    expect(s.hoursByCategory).toEqual({ volunteer: 5, clinical: 4, academic: 0 });
    expect(s.countsByCategory).toEqual({ volunteer: 2, clinical: 1, academic: 1 });
    expect(s.countsByMonth).toEqual({ '2026-01': 2, '2026-02': 2 });
  });

  it('handles an empty list', () => {
    expect(summarize([])).toEqual({
      totalCount: 0,
      totalHours: 0,
      hoursByCategory: {},
      countsByCategory: {},
      countsByMonth: {},
    });
  });
});

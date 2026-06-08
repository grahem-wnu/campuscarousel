import { describe, expect, it } from 'vitest';
import type { Application, College } from '../../shared/data/index.js';
import { buildDecisionMatrix } from './decision.js';

let n = 0;
const college = (over: Partial<College>): College => {
  n += 1;
  return { collegeId: `c${n}`, name: `College ${n}`, createdAt: 'x', updatedAt: 'x', ...over };
};
const application = (over: Partial<Application>): Application => ({
  applicationId: `a${(n += 1)}`,
  collegeId: 'c0',
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
});

describe('buildDecisionMatrix', () => {
  it('includes only applications with a real decision, joined to college data', () => {
    const colleges = [
      college({ collegeId: 'uci', name: 'UC Irvine', estimatedCostAfterAid: 18000, fitScore: 88 }),
      college({ collegeId: 'csulb', name: 'Long Beach', estimatedCostAfterAid: 9000, fitScore: 80 }),
      college({ collegeId: 'usc', name: 'USC', estimatedCostAfterAid: 42000, fitScore: 95 }),
    ];
    const apps = [
      application({ collegeId: 'uci', decision: 'accepted', decisionDate: '2027-03-10' }),
      application({ collegeId: 'csulb', decision: 'accepted' }),
      application({ collegeId: 'usc', decision: 'waitlisted' }),
      application({ collegeId: 'uci', decision: 'none' }), // ignored
      application({ collegeId: 'unknown', decision: 'rejected' }), // kept, name falls back to id
    ];

    const rows = buildDecisionMatrix(apps, colleges);

    // accepted first, cheaper net cost first within the same decision; waitlisted/rejected after.
    expect(rows.map((r) => r.collegeId)).toEqual(['csulb', 'uci', 'usc', 'unknown']);
    expect(rows[0]).toMatchObject({ name: 'Long Beach', decision: 'accepted', estimatedCostAfterAid: 9000 });
    expect(rows.find((r) => r.collegeId === 'unknown')?.name).toBe('unknown'); // graceful fallback
    expect(rows.every((r) => r.decision !== 'none')).toBe(true);
  });

  it('returns an empty matrix when no decisions have arrived', () => {
    expect(buildDecisionMatrix([application({ decision: 'none' }), application({})], [])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { summarizeFamily, rankFamilies, type FamilyUsageRow } from './families.js';
import type { UsageRow } from './aggregate.js';

const row = (costMicros: number, inp = 10, out = 4, occurredAt = '2026-07-13T00:00:00Z'): UsageRow => ({
  feature: 'assistant', model: 'm', inputTokens: inp, outputTokens: out,
  cacheReadTokens: 0, cacheWriteTokens: 0, costMicros, occurredAt,
});

const fam = (over: Partial<FamilyUsageRow>): FamilyUsageRow => ({
  tenantId: 'a', familyName: 'A', costMicros: 0, inputTokens: 1, outputTokens: 1, calls: 1,
  lastAiCallAt: null, activeDays: 0, lastSeenAt: null, activeUsers: 0, ...over,
});

describe('summarizeFamily', () => {
  it('sums cost/tokens/calls across a tenant’s rows', () => {
    expect(summarizeFamily([row(100), row(250)])).toEqual({
      costMicros: 350, inputTokens: 20, outputTokens: 8, calls: 2,
      lastAiCallAt: '2026-07-13T00:00:00Z', activeDays: 1,
    });
  });
  it('is all-zero for no rows', () => {
    expect(summarizeFamily([])).toEqual({
      costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0, lastAiCallAt: null, activeDays: 0,
    });
  });

  // Engagement signal: four of five prod families did ONE session and never returned. Distinct-day
  // counting is what makes that visible next to the cost column.
  it('counts distinct UTC days, not calls', () => {
    const s = summarizeFamily([
      row(1, 10, 4, '2026-07-13T01:00:00Z'),
      row(1, 10, 4, '2026-07-13T23:00:00Z'), // same day
      row(1, 10, 4, '2026-07-20T14:00:00Z'),
    ]);
    expect(s.activeDays).toBe(2);
    expect(s.calls).toBe(3);
  });

  it('tracks the latest AI call regardless of row order', () => {
    const s = summarizeFamily([
      row(1, 10, 4, '2026-07-26T16:34:00Z'),
      row(1, 10, 4, '2026-07-13T01:00:00Z'),
    ]);
    expect(s.lastAiCallAt).toBe('2026-07-26T16:34:00Z');
  });

  it('ignores rows with a missing timestamp', () => {
    const s = summarizeFamily([row(1, 10, 4, '')]);
    expect(s.lastAiCallAt).toBeNull();
    expect(s.activeDays).toBe(0);
    expect(s.calls).toBe(1);
  });
});

describe('rankFamilies', () => {
  it('sorts by costMicros desc and computes the grand total', () => {
    const fams: FamilyUsageRow[] = [
      fam({ tenantId: 'a', familyName: 'A', costMicros: 100 }),
      fam({ tenantId: 'b', familyName: 'B', costMicros: 500 }),
    ];
    const out = rankFamilies(fams);
    expect(out.families.map((f) => f.tenantId)).toEqual(['b', 'a']);
    expect(out.totalCostMicros).toBe(600);
  });

  it('keeps a zero-spend family that is still logging in', () => {
    const out = rankFamilies([
      fam({ tenantId: 'spender', costMicros: 900 }),
      fam({ tenantId: 'browser', costMicros: 0, calls: 0, lastSeenAt: '2026-08-01T00:00:00Z', activeUsers: 2 }),
    ]);
    expect(out.families).toHaveLength(2);
    expect(out.families[1]?.lastSeenAt).toBe('2026-08-01T00:00:00Z');
  });
});

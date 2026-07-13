import { describe, expect, it } from 'vitest';
import { summarizeFamily, rankFamilies, type FamilyUsageRow } from './families.js';
import type { UsageRow } from './aggregate.js';

const row = (costMicros: number, inp = 10, out = 4): UsageRow => ({
  feature: 'assistant', model: 'm', inputTokens: inp, outputTokens: out,
  cacheReadTokens: 0, cacheWriteTokens: 0, costMicros, occurredAt: '2026-07-13T00:00:00Z',
});

describe('summarizeFamily', () => {
  it('sums cost/tokens/calls across a tenant’s rows', () => {
    expect(summarizeFamily([row(100), row(250)])).toEqual({
      costMicros: 350, inputTokens: 20, outputTokens: 8, calls: 2,
    });
  });
  it('is all-zero for no rows', () => {
    expect(summarizeFamily([])).toEqual({ costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0 });
  });
});

describe('rankFamilies', () => {
  it('sorts by costMicros desc and computes the grand total', () => {
    const fams: FamilyUsageRow[] = [
      { tenantId: 'a', familyName: 'A', costMicros: 100, inputTokens: 1, outputTokens: 1, calls: 1 },
      { tenantId: 'b', familyName: 'B', costMicros: 500, inputTokens: 1, outputTokens: 1, calls: 1 },
    ];
    const out = rankFamilies(fams);
    expect(out.families.map((f) => f.tenantId)).toEqual(['b', 'a']);
    expect(out.totalCostMicros).toBe(600);
  });
});

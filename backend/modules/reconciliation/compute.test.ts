import { describe, expect, it } from 'vitest';
import { driftPct, isBreach, monthWindows, rollupItems, type TenantRollup } from './compute.js';

describe('monthWindows', () => {
  it('returns the current + prior month for a mid-month date (UTC)', () => {
    const [current, prior] = monthWindows('2026-07-13T09:30:00.000Z');
    expect(current).toEqual({
      month: '2026-07',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    expect(prior).toEqual({
      month: '2026-06',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    });
  });

  it('rolls the prior month back to December of the previous year for a January date', () => {
    const [current, prior] = monthWindows('2026-01-05T00:00:00.000Z');
    expect(current).toEqual({
      month: '2026-01',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });
    expect(prior).toEqual({
      month: '2025-12',
      from: '2025-12-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('driftPct', () => {
  it('is positive when the app over-counts vs AWS', () => {
    expect(driftPct(110, 100)).toBeCloseTo(10);
  });

  it('is negative when the app under-counts vs AWS', () => {
    expect(driftPct(90, 100)).toBeCloseTo(-10);
  });

  it('is 0 when both are zero (nothing to reconcile)', () => {
    expect(driftPct(0, 0)).toBe(0);
  });

  it('is 100 when AWS is zero but the app claims spend', () => {
    expect(driftPct(50, 0)).toBe(100);
  });
});

describe('isBreach', () => {
  it('breaches only when magnitude strictly exceeds the threshold', () => {
    expect(isBreach(6, 5)).toBe(true);
    expect(isBreach(-6, 5)).toBe(true);
    expect(isBreach(5, 5)).toBe(false);
    expect(isBreach(-4.9, 5)).toBe(false);
  });
});

describe('rollupItems', () => {
  const tenants: TenantRollup[] = [
    { tenantId: 'fam1', familyName: 'Alpha', costMicros: 140, inputTokens: 14, outputTokens: 7, calls: 2 },
    { tenantId: 'fam2', familyName: 'Beta', costMicros: 999, inputTokens: 20, outputTokens: 8, calls: 1, unpricedCostMicros: 12 },
    { tenantId: 'fam3', familyName: 'Gamma', costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0, unpricedCostMicros: 0 },
  ];

  it('shapes one derived item per tenant with the ROLLUP# key', () => {
    const items = rollupItems('2026-07', tenants, '2026-07-13T07:00:00.000Z');
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      PK: 'GLOBAL#USAGE',
      SK: 'ROLLUP#2026-07#T#fam1',
      month: '2026-07',
      tenantId: 'fam1',
      familyName: 'Alpha',
      costMicros: 140,
      inputTokens: 14,
      outputTokens: 7,
      calls: 2,
      computedAt: '2026-07-13T07:00:00.000Z',
    });
  });

  it('emits unpricedCostMicros only when > 0', () => {
    const items = rollupItems('2026-07', tenants, '2026-07-13T07:00:00.000Z');
    expect(items[1].unpricedCostMicros).toBe(12); // fam2 has unpriced cost
    expect(items[2].unpricedCostMicros).toBeUndefined(); // fam3's 0 is omitted
    expect(items[0].unpricedCostMicros).toBeUndefined(); // fam1 has none
  });

  it('is idempotent — same inputs produce identical keys + values', () => {
    const a = rollupItems('2026-07', tenants, '2026-07-13T07:00:00.000Z');
    const b = rollupItems('2026-07', tenants, '2026-07-13T07:00:00.000Z');
    expect(a).toEqual(b);
    expect(a.map((i) => i.SK)).toEqual([
      'ROLLUP#2026-07#T#fam1',
      'ROLLUP#2026-07#T#fam2',
      'ROLLUP#2026-07#T#fam3',
    ]);
  });
});

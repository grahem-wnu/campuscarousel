// backend/shared/metering/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { RATES, REGIONAL_PREMIUM, modelGeo, normalizeModelId, priceUsage } from './pricing.js';
import type { ModelRates } from './types.js';

const rates: Record<string, ModelRates> = {
  'anthropic.claude-sonnet-4': {
    inputMicros: 3,
    outputMicros: 15,
    cacheReadMicros: 1,
    cacheWriteMicros: 4,
  },
};

describe('normalizeModelId', () => {
  it('strips the us. cross-region prefix and the version suffix', () => {
    expect(normalizeModelId('us.anthropic.claude-sonnet-4-20250514-v1:0')).toBe(
      'anthropic.claude-sonnet-4',
    );
  });
  it('strips the global. routing prefix to the same key as the regional profile', () => {
    expect(normalizeModelId('global.anthropic.claude-sonnet-4-6')).toBe(
      normalizeModelId('us.anthropic.claude-sonnet-4-6'),
    );
  });
  it('is a no-op for an already-normalized id', () => {
    expect(normalizeModelId('anthropic.claude-sonnet-4')).toBe('anthropic.claude-sonnet-4');
  });
});

describe('modelGeo', () => {
  it('classifies geo-scoped profiles as regional', () => {
    expect(modelGeo('us.anthropic.claude-sonnet-4-6')).toBe('regional');
    expect(modelGeo('eu.anthropic.claude-sonnet-4-6')).toBe('regional');
    expect(modelGeo('apac.anthropic.claude-sonnet-4-6')).toBe('regional');
  });
  it('classifies the global profile and bare model ids as global', () => {
    expect(modelGeo('global.anthropic.claude-sonnet-4-6')).toBe('global');
    expect(modelGeo('anthropic.claude-sonnet-4-6')).toBe('global');
  });
});

describe('priceUsage', () => {
  it('sums cost across all four token classes in micro-dollars', () => {
    const priced = priceUsage(
      'global.anthropic.claude-sonnet-4-20250514-v1:0',
      { inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5 },
      rates,
    );
    // 100*3 + 40*15 + 10*1 + 5*4 = 300 + 600 + 10 + 20 = 930
    expect(priced).toEqual({ costMicros: 930, unpriced: false });
  });

  it('flags an unknown model as unpriced with zero cost', () => {
    const priced = priceUsage('anthropic.some-future-model', { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 }, rates);
    expect(priced).toEqual({ costMicros: 0, unpriced: true });
  });

  // Regression guard: the ACTUAL deployed Bedrock model id (staging/prod run
  // us.anthropic.claude-sonnet-4-6) must be in the real RATES table, not unpriced.
  // A live staging usage row on 2026-07-13 showed unpriced=true/costMicros=0 because
  // only the `claude-sonnet-4` key existed — this test would have caught it.
  it('prices the deployed claude-sonnet-4-6 profile against the real RATES', () => {
    const priced = priceUsage(
      'global.anthropic.claude-sonnet-4-6',
      { inputTokens: 280, outputTokens: 31, cacheReadTokens: 0, cacheWriteTokens: 0 },
      RATES,
    );
    expect(priced.unpriced).toBe(false);
    expect(priced.costMicros).toBe(280 * 3 + 31 * 15); // 1305 micro-dollars
  });

  // Regression guard for the 10% under-reporting bug: prod ran the `us.` profile while the rate
  // table held global rates, so every recorded cost was exactly 10% low against the AWS bill.
  it('charges a geo-scoped profile exactly REGIONAL_PREMIUM over the global one', () => {
    const usage = { inputTokens: 280, outputTokens: 31, cacheReadTokens: 12, cacheWriteTokens: 7 };
    const global = priceUsage('global.anthropic.claude-sonnet-4-6', usage, RATES);
    const regional = priceUsage('us.anthropic.claude-sonnet-4-6', usage, RATES);
    // Ratio, not `round(global * premium)` — priceUsage rounds ONCE at the end, so re-rounding an
    // already-rounded global figure can differ by a micro-dollar.
    expect(regional.costMicros / global.costMicros).toBeCloseTo(REGIONAL_PREMIUM, 3);
    expect(regional.costMicros).toBeGreaterThan(global.costMicros);
  });

  it('applies no premium to a bare (non-profile) model id', () => {
    const usage = { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(priceUsage('anthropic.claude-sonnet-4-6', usage, RATES).costMicros).toBe(3000);
  });

  // Anchors the rate table to observed July 2026 prod billing: the regional profile bills
  // $3.30/1M input and $16.50/1M output.
  it('matches the observed regional per-million rates', () => {
    const input = priceUsage(
      'us.anthropic.claude-sonnet-4-6',
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      RATES,
    );
    const output = priceUsage(
      'us.anthropic.claude-sonnet-4-6',
      { inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      RATES,
    );
    expect(input.costMicros).toBe(3_300_000); // $3.30
    expect(output.costMicros).toBe(16_500_000); // $16.50
  });
});

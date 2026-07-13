// backend/shared/metering/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { RATES, normalizeModelId, priceUsage } from './pricing.js';
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
  it('is a no-op for an already-normalized id', () => {
    expect(normalizeModelId('anthropic.claude-sonnet-4')).toBe('anthropic.claude-sonnet-4');
  });
});

describe('priceUsage', () => {
  it('sums cost across all four token classes in micro-dollars', () => {
    const priced = priceUsage(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
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
  it('prices the deployed us.anthropic.claude-sonnet-4-6 profile against the real RATES', () => {
    const priced = priceUsage(
      'us.anthropic.claude-sonnet-4-6',
      { inputTokens: 280, outputTokens: 31, cacheReadTokens: 0, cacheWriteTokens: 0 },
      RATES,
    );
    expect(priced.unpriced).toBe(false);
    expect(priced.costMicros).toBe(280 * 3 + 31 * 15); // 1305 micro-dollars
  });
});

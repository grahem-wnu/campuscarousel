// backend/shared/metering/pricing.ts
import type { ModelRates, PricedUsage, TokenUsage } from './types.js';

/**
 * Normalize a Bedrock model/inference-profile id to a rate-table key:
 * strip the leading `us.`/`eu.`/`apac.` cross-region prefix and the trailing
 * `-<date>-v<n>:<m>` version, e.g.
 *   us.anthropic.claude-sonnet-4-20250514-v1:0  ->  anthropic.claude-sonnet-4
 */
export function normalizeModelId(modelId: string): string {
  const withoutRegion = modelId.replace(/^(us|eu|apac)\./, '');
  return withoutRegion.replace(/-\d{8}-v\d+:\d+$/, '');
}

/**
 * Current Bedrock per-token rates in micro-dollars.
 *
 * TODO(build): fill these with the CURRENT us.anthropic.claude-sonnet-4 Bedrock rates.
 * Do NOT guess from memory — load the `claude-api` skill / its pricing reference at build
 * time, convert $/million-tokens to micros/token (e.g. $3.00 / 1M input = 3 micros/token),
 * and date-stamp this table. Cache-read and cache-write have distinct rates.
 */
export const RATES: Record<string, ModelRates> = {
  // 'anthropic.claude-sonnet-4': { inputMicros: ?, outputMicros: ?, cacheReadMicros: ?, cacheWriteMicros: ? },
};

export function priceUsage(
  modelId: string,
  usage: TokenUsage,
  rates: Record<string, ModelRates> = RATES,
): PricedUsage {
  const rate = rates[normalizeModelId(modelId)];
  if (!rate) return { costMicros: 0, unpriced: true };
  const costMicros =
    usage.inputTokens * rate.inputMicros +
    usage.outputTokens * rate.outputMicros +
    usage.cacheReadTokens * rate.cacheReadMicros +
    usage.cacheWriteTokens * rate.cacheWriteMicros;
  return { costMicros, unpriced: false };
}

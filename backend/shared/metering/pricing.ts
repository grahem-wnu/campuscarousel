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
 * Current Bedrock per-token rates in micro-dollars per token.
 *
 * Numerically, micros-per-token == dollars-per-million-tokens (both are price * 1e-6 per token),
 * so a $3.00 / 1M-token input rate is `3`. Cache rates are fractional (e.g. $0.30 / 1M = 0.3);
 * priceUsage() rounds the summed cost so the stored costMicros stays an integer.
 *
 * Keys are the normalizeModelId() output for each deployed Bedrock model/inference-profile.
 * Staging/prod currently run `us.anthropic.claude-sonnet-4-6` (→ key `anthropic.claude-sonnet-4-6`,
 * VERIFIED against a live staging usage row 2026-07-13). `anthropic.claude-sonnet-4` is kept in
 * case an environment pins the dated Sonnet-4 profile. Both share Sonnet-tier pricing:
 * input $3.00, output $15.00, 5-min cache write $3.75 (1.25x input), cache read $0.30 (0.1x input)
 * per 1M tokens. An unlisted model records tokens with unpriced=true, costMicros=0 (fail-safe) —
 * add its key here. Re-check when BEDROCK_MODEL_ID changes.
 */
const SONNET_RATES: ModelRates = {
  inputMicros: 3,
  outputMicros: 15,
  cacheReadMicros: 0.3,
  cacheWriteMicros: 3.75,
};

export const RATES: Record<string, ModelRates> = {
  'anthropic.claude-sonnet-4-6': SONNET_RATES,
  'anthropic.claude-sonnet-4': SONNET_RATES,
};

export function priceUsage(
  modelId: string,
  usage: TokenUsage,
  rates: Record<string, ModelRates> = RATES,
): PricedUsage {
  const rate = rates[normalizeModelId(modelId)];
  if (!rate) return { costMicros: 0, unpriced: true };
  // Rates can be fractional micros/token (cache rates), so round to keep costMicros integer.
  const costMicros = Math.round(
    usage.inputTokens * rate.inputMicros +
      usage.outputTokens * rate.outputMicros +
      usage.cacheReadTokens * rate.cacheReadMicros +
      usage.cacheWriteTokens * rate.cacheWriteMicros,
  );
  return { costMicros, unpriced: false };
}

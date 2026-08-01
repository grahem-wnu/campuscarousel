// backend/shared/metering/pricing.ts
import type { ModelRates, PricedUsage, TokenUsage } from './types.js';

/** Where an inference profile routes: `global.` fans out worldwide, `us.`/`eu.`/`apac.` stay in a geo. */
export type ModelGeo = 'global' | 'regional';

/**
 * Normalize a Bedrock model/inference-profile id to a rate-table key:
 * strip the leading `global.`/`us.`/`eu.`/`apac.` routing prefix and the trailing
 * `-<date>-v<n>:<m>` version, e.g.
 *   us.anthropic.claude-sonnet-4-20250514-v1:0  ->  anthropic.claude-sonnet-4
 *   global.anthropic.claude-sonnet-4-6          ->  anthropic.claude-sonnet-4-6
 */
export function normalizeModelId(modelId: string): string {
  const withoutRegion = modelId.replace(/^(global|us|eu|apac)\./, '');
  return withoutRegion.replace(/-\d{8}-v\d+:\d+$/, '');
}

/**
 * Classify an id by its routing prefix. A geo-scoped profile (`us.`/`eu.`/`apac.`) bills at a
 * premium over the global profile; a bare model id (direct in-region invoke) bills at base.
 */
export function modelGeo(modelId: string): ModelGeo {
  return /^(us|eu|apac)\./.test(modelId) ? 'regional' : 'global';
}

/**
 * Surcharge applied to a geo-scoped inference profile relative to the global profile.
 *
 * VERIFIED against July 2026 prod billing: Cost Explorer reports Claude Sonnet 4.6 under two
 * usage-type pairs in the same account —
 *   USE2_InputTokenCount-Units          $3.30/1M   vs   USE2_InputTokenCount_Global-Units   $3.00/1M
 *   USE2_OutputTokenCount-Units        $16.50/1M   vs   USE2_OutputTokenCount_Global-Units $15.00/1M
 *   USE2_CacheWriteInputTokenCount      $4.125/1M  vs   (global) $3.75/1M
 * — an exact 1.1x on every class. Before this constant existed the app priced the deployed `us.`
 * profile at global rates, under-reporting every recorded cost by exactly 10%.
 *
 * If AWS ever varies the premium per model, replace this scalar with a per-model pair in RATES.
 */
export const REGIONAL_PREMIUM = 1.1;

/**
 * GLOBAL-profile Bedrock rates in micro-dollars per token. Regional profiles derive from these
 * via REGIONAL_PREMIUM, so there is exactly one place to edit when list prices change.
 *
 * Numerically, micros-per-token == dollars-per-million-tokens (both are price * 1e-6 per token),
 * so a $3.00 / 1M-token input rate is `3`. Cache rates are fractional (e.g. $0.30 / 1M = 0.3);
 * priceUsage() rounds the final cost so the stored costMicros stays an integer.
 *
 * Keys are the normalizeModelId() output for each deployed model/inference-profile — the routing
 * prefix is NOT part of the key, since global and regional share one base rate. Sonnet tier:
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
  const base =
    usage.inputTokens * rate.inputMicros +
    usage.outputTokens * rate.outputMicros +
    usage.cacheReadTokens * rate.cacheReadMicros +
    usage.cacheWriteTokens * rate.cacheWriteMicros;
  // Rates can be fractional micros/token and the premium is a 1.1x scalar, so round LAST to keep
  // costMicros an integer without compounding per-class rounding error.
  const multiplier = modelGeo(modelId) === 'regional' ? REGIONAL_PREMIUM : 1;
  return { costMicros: Math.round(base * multiplier), unpriced: false };
}

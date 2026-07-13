// backend/shared/metering/parse-usage.ts
import type { TokenUsage } from './types.js';

interface AnthropicUsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Extract the four billable token classes from a parsed Anthropic (Bedrock Messages API)
 * response. Missing/absent fields default to 0 — never throws, so a malformed response
 * cannot break the surrounding AI call.
 *
 * NOTE (verify at build): confirm Bedrock returns cache token counts under these exact keys
 * (`cache_read_input_tokens` / `cache_creation_input_tokens`) on the Messages API.
 */
export function parseUsage(response: { usage?: AnthropicUsageBlock } | null | undefined): TokenUsage {
  const u = response?.usage ?? {};
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
  };
}

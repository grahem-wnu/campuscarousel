// backend/shared/metering/types.ts
/** The four token classes Bedrock/Anthropic bills separately. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Per-token rates in micro-dollars (1e-6 USD) per token, per class. */
export interface ModelRates {
  inputMicros: number;
  outputMicros: number;
  cacheReadMicros: number;
  cacheWriteMicros: number;
}

export interface PricedUsage {
  costMicros: number;
  unpriced: boolean;
}

/** Input to recordUsage() — everything needed for one append-only usage row. */
export interface UsageRecordInput {
  feature: string;
  model: string;
  usage: TokenUsage;
  requestId: string;
  callId: string;
  occurredAt: string; // iso8601
}

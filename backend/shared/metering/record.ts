// backend/shared/metering/record.ts
import { tableClientFromEnv, type TableClient } from '../data/index.js';
import { currentTenantId, maybeStudentId } from '../tenant/index.js';
import { priceUsage } from './pricing.js';
import type { ModelRates, UsageRecordInput } from './types.js';

export interface RecordDeps {
  client?: TableClient;
  rates?: Record<string, ModelRates>;
}

let cached: TableClient | undefined;

/**
 * Append one immutable usage row. Uses the base (unscoped) client with an explicit
 * `T#<tenant>#USAGE` PK so platform-admin cross-tenant reads (which run without tenant
 * context) can query a family's partition by literal key.
 *
 * NEVER throws: a metering write failure is logged and swallowed so it cannot break the
 * user-facing AI call. The Phase-2 reconciliation job + Bedrock invocation logs are the
 * backstop that makes a dropped row visible.
 */
export async function recordUsage(input: UsageRecordInput, deps: RecordDeps = {}): Promise<void> {
  // NOTE: currentTenantId() throws when no tenant context is set. That throw is deliberately
  // swallowed by the catch below — a Bedrock call made outside a tenant context records nothing
  // rather than breaking the AI call. Phase-2 reconciliation is the backstop. Not a bug.
  try {
    const client = deps.client ?? (cached ??= tableClientFromEnv());
    const tenantId = currentTenantId();
    const studentId = maybeStudentId();
    const { costMicros, unpriced } = priceUsage(input.model, input.usage, deps.rates);
    await client.put({
      PK: `T#${tenantId}#USAGE`,
      SK: `TS#${input.occurredAt}#${input.callId}`,
      feature: input.feature,
      model: input.model,
      ...(studentId ? { studentId } : {}),
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheReadTokens: input.usage.cacheReadTokens,
      cacheWriteTokens: input.usage.cacheWriteTokens,
      costMicros,
      unpriced,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
    });
  } catch (err) {
    console.error('[metering] recordUsage failed (swallowed)', {
      feature: input.feature,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

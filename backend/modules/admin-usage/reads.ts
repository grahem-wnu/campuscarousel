// Shared USAGE-partition read helpers. Extracted from handlers.ts so both the per-family
// (GET /admin/usage) and all-families (GET /admin/usage/families) handlers reuse the same
// paginated-read + SK-range logic. Pure of business aggregation — I/O + row shaping only.

import { type TableClient } from '../../shared/data/index.js';
import { type UsageRow } from './aggregate.js';

/** Query a full USAGE partition (paginated by the client) for an optional SK range. */
export async function queryAll(
  client: TableClient,
  pk: string,
  opts: { skBetween?: [string, string] },
): Promise<Array<Record<string, unknown>>> {
  return (await client.query(pk, opts)) as Array<Record<string, unknown>>;
}

/** Build an inclusive SK BETWEEN range from ISO from/to (the `~` upper sentinel includes last-ms rows). */
export function rangeToSkOpts(from?: string, to?: string): { skBetween?: [string, string] } {
  if (from && to) return { skBetween: [`TS#${from}`, `TS#${to}~`] };
  if (from) return { skBetween: [`TS#${from}`, 'TS#~'] };
  return {};
}

export function toUsageRow(it: Record<string, unknown>): UsageRow {
  return {
    feature: String(it.feature ?? ''),
    model: String(it.model ?? ''),
    studentId: it.studentId as string | undefined,
    inputTokens: Number(it.inputTokens ?? 0),
    outputTokens: Number(it.outputTokens ?? 0),
    cacheReadTokens: Number(it.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(it.cacheWriteTokens ?? 0),
    costMicros: Number(it.costMicros ?? 0),
    occurredAt: String(it.occurredAt ?? ''),
  };
}

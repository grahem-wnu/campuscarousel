// Pure all-families aggregation — no I/O. Summarizes one tenant's usage rows into a single
// per-family total, and ranks a list of families by cost (biggest spenders first) with grand
// totals. The families handler wires these onto per-tenant reads.

import type { UsageRow } from './aggregate.js';

export interface FamilySummary {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** Most recent AI call in the queried range; null when the family made none. */
  lastAiCallAt: string | null;
  /** Distinct UTC days in the range on which the family made at least one AI call. */
  activeDays: number;
}

export interface FamilyUsageRow extends FamilySummary {
  tenantId: string;
  familyName: string;
  /** Signup parent's email (tenant consent record) — disambiguates same-named families. Absent on
   *  tenants provisioned before consent capture. */
  email?: string;
  /** Most recent authenticated request by ANY member — ALL-TIME, not range-scoped, because "when did
   *  this family last show up" isn't a function of the window you're looking at. Null when nobody has
   *  been stamped yet (families last active before the stamp shipped on 2026-08-01 read as null;
   *  there is no source to backfill from). */
  lastSeenAt: string | null;
  /** How many distinct members have ever been stamped. */
  activeUsers: number;
}

export interface FamiliesUsageResponse {
  families: FamilyUsageRow[];
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function summarizeFamily(rows: UsageRow[]): FamilySummary {
  const s: FamilySummary = {
    costMicros: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    lastAiCallAt: null,
    activeDays: 0,
  };
  const days = new Set<string>();
  for (const r of rows) {
    s.costMicros += r.costMicros;
    s.inputTokens += r.inputTokens;
    s.outputTokens += r.outputTokens;
    s.calls += 1;
    if (r.occurredAt) {
      days.add(r.occurredAt.slice(0, 10));
      if (s.lastAiCallAt === null || r.occurredAt > s.lastAiCallAt) s.lastAiCallAt = r.occurredAt;
    }
  }
  s.activeDays = days.size;
  return s;
}

export function rankFamilies(families: FamilyUsageRow[]): FamiliesUsageResponse {
  const sorted = [...families].sort((a, b) => b.costMicros - a.costMicros);
  return {
    families: sorted,
    totalCostMicros: sorted.reduce((n, f) => n + f.costMicros, 0),
    totalInputTokens: sorted.reduce((n, f) => n + f.inputTokens, 0),
    totalOutputTokens: sorted.reduce((n, f) => n + f.outputTokens, 0),
  };
}

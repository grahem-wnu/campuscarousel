// Pure all-families aggregation — no I/O. Summarizes one tenant's usage rows into a single
// per-family total, and ranks a list of families by cost (biggest spenders first) with grand
// totals. The families handler wires these onto per-tenant reads.

import type { UsageRow } from './aggregate.js';

export interface FamilySummary {
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface FamilyUsageRow extends FamilySummary {
  tenantId: string;
  familyName: string;
  /** Signup parent's email (tenant consent record) — disambiguates same-named families. Absent on
   *  tenants provisioned before consent capture. */
  email?: string;
}

export interface FamiliesUsageResponse {
  families: FamilyUsageRow[];
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function summarizeFamily(rows: UsageRow[]): FamilySummary {
  const s: FamilySummary = { costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  for (const r of rows) {
    s.costMicros += r.costMicros;
    s.inputTokens += r.inputTokens;
    s.outputTokens += r.outputTokens;
    s.calls += 1;
  }
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

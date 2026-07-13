// Admin "Usage" page types — mirror the backend GET /admin/usage response
// (backend/modules/admin-usage/aggregate.ts). All money is integer micro-dollars.

export interface UsageBucket {
  key: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface UsageResponse {
  tenantId: string;
  groupBy: 'feature' | 'student' | 'model' | 'day';
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  buckets: UsageBucket[];
}

export type GroupBy = UsageResponse['groupBy'];

// GET /admin/usage/families (platform admin) — one ranked row per family plus grand totals.
// Mirrors backend/modules/admin-usage/families.ts.
export interface FamilyUsageRow {
  tenantId: string;
  familyName: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface FamiliesUsageResponse {
  families: FamilyUsageRow[];
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

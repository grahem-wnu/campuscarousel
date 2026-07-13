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

// GET /admin/usage/reconciliation (platform admin) — latest drift status for a month. The prod-only
// reconcile job compares the app's summed Bedrock cost against AWS actuals; staging always returns
// not_computed. Mirrors backend/modules/admin-usage/handlers.ts + reconciliation/reconcile.ts.
export interface ReconciliationStatus {
  month: string;
  appCostMicros: number;
  awsCostMicros: number;
  driftPct: number;
  appTokens: number;
  awsTokens: number;
  breach: boolean;
  computedAt: string;
  caveat: string;
}

export interface ReconciliationNotComputed {
  month: string;
  status: 'not_computed';
}

export type ReconciliationResponse = ReconciliationStatus | ReconciliationNotComputed;

/** Narrow to the computed variant (a real status row was found). */
export function isReconciliationComputed(r: ReconciliationResponse): r is ReconciliationStatus {
  return !('status' in r);
}

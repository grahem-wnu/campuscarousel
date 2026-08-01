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
  /** Signup parent's email — disambiguates same-named families; absent on pre-consent tenants. */
  email?: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** Most recent AI call WITHIN the selected range; null if the family made none. */
  lastAiCallAt: string | null;
  /** Distinct days in the range with at least one AI call. */
  activeDays: number;
  /** Most recent authenticated request by any member — ALL-TIME, deliberately not range-scoped.
   *  null for families last active before the stamp shipped (2026-08-01); not backfillable. */
  lastSeenAt: string | null;
  /** Distinct members ever stamped. */
  activeUsers: number;
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
  /** null when AWS actuals were unavailable this run (e.g. Cost Explorer rate-limit). */
  awsCostMicros: number | null;
  driftPct: number | null;
  appTokens: number;
  awsTokens: number | null;
  breach: boolean;
  /** false → the rollups were recomputed but AWS actuals couldn't be fetched; there's no drift. */
  actualsAvailable: boolean;
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

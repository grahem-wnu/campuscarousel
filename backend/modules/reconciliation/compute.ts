// Pure reconciliation compute — no I/O, fully deterministic. All functions take `now`/`computedAt`
// as ISO string params (never call `new Date()` here) so tests pin exact outputs. Money is integer
// micro-dollars end to end.

/** A UTC calendar-month window: [from, to) with the label the rollup/recon rows are keyed by. */
export interface MonthWindow {
  /** `YYYY-MM` (UTC). */
  month: string;
  /** ISO first-of-month at 00:00:00.000Z. */
  from: string;
  /** ISO first-of-NEXT-month at 00:00:00.000Z (exclusive upper bound). */
  to: string;
}

function monthWindow(year: number, monthIndex: number): MonthWindow {
  // Date.UTC normalizes overflow/underflow (monthIndex 12 → next Jan, -1 → prev Dec).
  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1));
  const label = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
  return { month: label, from: from.toISOString(), to: to.toISOString() };
}

/** The current + prior calendar month (UTC) for `nowIso`. Prior handles the Jan→Dec year rollover. */
export function monthWindows(nowIso: string): MonthWindow[] {
  const now = new Date(nowIso);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  return [monthWindow(y, m), monthWindow(y, m - 1)];
}

/**
 * Does a Cost Explorer SERVICE dimension value represent Bedrock spend?
 *
 * AWS does NOT bill Bedrock model usage under a service literally named "Amazon Bedrock" — each
 * model gets its own service name, e.g. `Claude Sonnet 4.6 (Amazon Bedrock Edition)` and
 * `Claude Haiku 4.5 (Amazon Bedrock Edition)`. Filtering on the literal name (as this job did until
 * 2026-08-01) matches NOTHING and silently reads $0, which made driftPct hard-return its
 * `awsMicros === 0` sentinel of 100 and fire a false breach alert on every run.
 *
 * Substring-matching "bedrock" catches the per-model names, the literal service if AWS ever adds
 * one, and any future model without a code change.
 */
export function isBedrockService(serviceName: string): boolean {
  return /bedrock/i.test(serviceName);
}

/** Sum Bedrock-attributable cost (micro-dollars) from SERVICE-grouped Cost Explorer amounts. */
export function sumBedrockCostMicros(
  groups: Array<{ service: string; amount?: string }>,
): number {
  let micros = 0;
  for (const g of groups) {
    if (!isBedrockService(g.service) || !g.amount) continue;
    const parsed = parseFloat(g.amount);
    if (Number.isFinite(parsed)) micros += Math.round(parsed * 1_000_000);
  }
  return micros;
}

/**
 * Signed drift of the app's summed cost against the AWS baseline, as a percentage of AWS actuals.
 * When AWS is zero: 0 if the app is also zero (nothing to reconcile), else 100 (app claims spend AWS
 * doesn't show — a full-baseline miss).
 */
export function driftPct(appMicros: number, awsMicros: number): number {
  if (awsMicros === 0) return appMicros === 0 ? 0 : 100;
  return ((appMicros - awsMicros) / awsMicros) * 100;
}

/** A drift is a breach when its magnitude exceeds the threshold (strictly greater). */
export function isBreach(drift: number, thresholdPct: number): boolean {
  return Math.abs(drift) > thresholdPct;
}

/** One tenant's summed usage for a month — the input to a rollup row. */
export interface TenantRollup {
  tenantId: string;
  familyName: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** Cost carried by rows we couldn't price (unlisted model). Usually 0; emitted only when > 0. */
  unpricedCostMicros?: number;
}

/** A derived monthly rollup DynamoDB item (one per tenant). Stored under the global rollup partition. */
export interface RollupItem {
  PK: 'GLOBAL#USAGE';
  SK: string;
  month: string;
  tenantId: string;
  familyName: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  unpricedCostMicros?: number;
  computedAt: string;
}

/**
 * Shape one derived rollup item per tenant for `month`. Pure + idempotent: the same inputs always
 * produce the same keys (`ROLLUP#<month>#T#<tenantId>`) and values, so a re-run overwrites in place.
 */
export function rollupItems(
  month: string,
  tenants: TenantRollup[],
  computedAt: string,
): RollupItem[] {
  return tenants.map((t) => {
    const item: RollupItem = {
      PK: 'GLOBAL#USAGE',
      SK: `ROLLUP#${month}#T#${t.tenantId}`,
      month,
      tenantId: t.tenantId,
      familyName: t.familyName,
      costMicros: t.costMicros,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      calls: t.calls,
      computedAt,
    };
    if (t.unpricedCostMicros !== undefined && t.unpricedCostMicros > 0) {
      item.unpricedCostMicros = t.unpricedCostMicros;
    }
    return item;
  });
}

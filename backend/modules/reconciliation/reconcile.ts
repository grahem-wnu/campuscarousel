// runReconciliation — the scheduled prod job's core, over injectable ports so it is fully testable
// with fakes (no real AWS). For each of the current + prior calendar month it: recomputes per-tenant
// monthly rollups from raw `T#<tenant>#USAGE` rows, reconciles the app's summed Bedrock cost/tokens
// against AWS actuals (Cost Explorer $ + invocation-log tokens), stores a status row, emits metrics,
// and alerts on drift beyond the threshold. Pure math lives in compute.ts; this file is orchestration.
//
// Multi-tenant, no tenant context: like digest.ts it enumerates the global tenant registry and reads
// each family's partition by literal PK through the BASE (unscoped) client. Per-tenant try/catch — one
// bad family never aborts the run.

import { type Data, type StoredItem, type TableClient } from '../../shared/data/index.js';
import { summarizeFamily } from '../admin-usage/families.js';
import { queryAll, rangeToSkOpts, toUsageRow } from '../admin-usage/reads.js';
import { driftPct, isBreach, monthWindows, rollupItems, type TenantRollup } from './compute.js';
import { type AlertPort, type CostExplorerPort, type InvocationLogPort, type MetricsPort } from './ports.js';

/** The account-total, prod-only nature of the numbers, surfaced in the status row + UI. */
const CAVEAT = 'account-total incl. staging noise; Cost Explorer ~24h delayed';

export interface ReconcileDeps {
  data: Data;
  baseClient: TableClient;
  costExplorer: CostExplorerPort;
  logs: InvocationLogPort;
  alert: AlertPort;
  metrics: MetricsPort;
  now: () => string;
  thresholdPct: number;
}

export interface MonthResult {
  month: string;
  appCostMicros: number;
  /** null when AWS actuals were unavailable for this window (e.g. Cost Explorer rate-limit). */
  awsCostMicros: number | null;
  /** null when there's no AWS baseline to reconcile against. */
  driftPct: number | null;
  appTokens: number;
  awsTokens: number | null;
  breach: boolean;
  /** false when the AWS actuals fetch failed — the app-side rollups are still recomputed + stored. */
  actualsAvailable: boolean;
  tenants: number;
}

export interface ReconcileResult {
  months: MonthResult[];
}

export async function runReconciliation(deps: ReconcileDeps): Promise<ReconcileResult> {
  const computedAt = deps.now();
  const windows = monthWindows(computedAt);
  const tenants = await deps.data.tenants.list(); // global registry — no tenant context needed
  const months: MonthResult[] = [];

  for (const window of windows) {
    // --- 1. Recompute per-tenant rollups from raw usage rows ---
    const rollups: TenantRollup[] = [];
    let appCostMicros = 0;
    let appInputTokens = 0;
    let appOutputTokens = 0;
    for (const tenant of tenants) {
      try {
        const items = await queryAll(
          deps.baseClient,
          `T#${tenant.tenantId}#USAGE`,
          rangeToSkOpts(window.from, window.to),
        );
        const summary = summarizeFamily(items.map(toUsageRow));
        // Sum cost carried by rows we couldn't price (unlisted model) — normally 0, defensive.
        const unpricedCostMicros = items.reduce(
          (n, it) => n + (it.unpriced === true ? Number(it.costMicros ?? 0) : 0),
          0,
        );
        rollups.push({
          tenantId: tenant.tenantId,
          familyName: tenant.familyName,
          costMicros: summary.costMicros,
          inputTokens: summary.inputTokens,
          outputTokens: summary.outputTokens,
          calls: summary.calls,
          unpricedCostMicros,
        });
        appCostMicros += summary.costMicros;
        appInputTokens += summary.inputTokens;
        appOutputTokens += summary.outputTokens;
      } catch (err) {
        // One family's read failure must not abort the reconciliation.
        console.error('reconcile: tenant failed', tenant.tenantId, err);
      }
    }

    const appTokens = appInputTokens + appOutputTokens;

    // --- 2. Persist the rollup rows FIRST — they're a pure recompute of app-side usage and do NOT
    //        depend on AWS actuals, so a downstream actuals failure must never lose this work. ---
    for (const item of rollupItems(window.month, rollups, computedAt)) {
      // RollupItem is a closed shape; StoredItem carries an index signature (extra attrs allowed).
      await deps.baseClient.put(item as unknown as StoredItem);
    }

    // --- 3. AWS actuals for this window — NON-FATAL. Cost Explorer has notably low rate limits; a
    //        transient throw must not abort the invocation (losing the prior-month "stable check"
    //        window too). On failure we mark actuals unavailable and reconcile nothing this run. ---
    let awsCostMicros: number | null = null;
    let awsTokens: number | null = null;
    let actualsAvailable = true;
    try {
      awsCostMicros = await deps.costExplorer.bedrockCostMicros(
        window.from.slice(0, 10),
        window.to.slice(0, 10),
      );
      const awsToken = await deps.logs.tokenTotals(window.from, window.to);
      awsTokens = awsToken.inputTokens + awsToken.outputTokens;
    } catch (err) {
      console.error('reconcile: AWS actuals unavailable for', window.month, err);
      actualsAvailable = false;
      awsCostMicros = null;
      awsTokens = null;
    }

    // --- 4. Drift only when there's a baseline. Without actuals we can't reconcile — no drift, no
    //        breach, no alert (a $0 drift would be misleading). ---
    const drift = actualsAvailable ? driftPct(appCostMicros, awsCostMicros as number) : null;
    const breach = drift !== null && isBreach(drift, deps.thresholdPct);

    // --- 5. Status row ---
    await deps.baseClient.put({
      PK: 'GLOBAL#RECON',
      SK: `MONTH#${window.month}`,
      month: window.month,
      appCostMicros,
      awsCostMicros,
      driftPct: drift,
      appTokens,
      awsTokens,
      breach,
      actualsAvailable,
      computedAt,
      caveat: CAVEAT,
    });

    // --- 6. Metrics every run (aws/drift omitted when unavailable); alert only on a real breach. ---
    await deps.metrics.emit({ appCostMicros, awsCostMicros, driftPct: drift, month: window.month });
    if (breach && drift !== null) {
      await deps.alert.publish(
        `Bedrock cost drift ${drift.toFixed(1)}% for ${window.month}`,
        [
          `Month: ${window.month}`,
          `App cost: ${appCostMicros} µ$  |  AWS cost: ${awsCostMicros ?? 0} µ$`,
          `Drift: ${drift.toFixed(2)}% (threshold ${deps.thresholdPct}%)`,
          `App tokens: ${appTokens}  |  AWS tokens: ${awsTokens ?? 0}`,
          CAVEAT,
        ].join('\n'),
      );
    }

    months.push({
      month: window.month,
      appCostMicros,
      awsCostMicros,
      driftPct: drift,
      appTokens,
      awsTokens,
      breach,
      actualsAvailable,
      tenants: rollups.length,
    });
  }

  return { months };
}

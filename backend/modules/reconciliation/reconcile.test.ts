import { describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data, type StoredItem } from '../../shared/data/index.js';
import { runReconciliation, type ReconcileDeps } from './reconcile.js';
import type { AlertPort, CostExplorerPort, InvocationLogPort, MetricsPort } from './ports.js';

const NOW = '2026-07-13T07:00:00.000Z'; // windows → 2026-07 (current) + 2026-06 (prior)

function usageRow(tenant: string, occurredAt: string, extra: Partial<StoredItem> = {}): StoredItem {
  return {
    PK: `T#${tenant}#USAGE`,
    SK: `TS#${occurredAt}`,
    feature: 'focus',
    model: 'anthropic.claude-sonnet-4',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicros: 100,
    unpriced: false,
    occurredAt,
    ...extra,
  };
}

/** Cost Explorer fake keyed by the window's fromDate (YYYY-MM-DD) so each month gets its own actual. */
function fakeCostExplorer(byFromDate: Record<string, number>): CostExplorerPort {
  return { bedrockCostMicros: (fromDate) => Promise.resolve(byFromDate[fromDate] ?? 0) };
}
function fakeLogs(tokens: { inputTokens: number; outputTokens: number }): InvocationLogPort {
  return { tokenTotals: () => Promise.resolve(tokens) };
}

async function harness(over: Partial<ReconcileDeps> = {}) {
  const client = new InMemoryTableClient();
  const data: Data = makeData(client);
  await data.tenants.create({ tenantId: 'fam1', familyName: 'Alpha', plan: 'free', status: 'active' });
  await data.tenants.create({ tenantId: 'fam2', familyName: 'Beta', plan: 'free', status: 'active' });
  // July usage: fam1 = 600µ$, fam2 = 400µ$ → app total 1000µ$.
  await client.put(usageRow('fam1', '2026-07-05T00:00:00.000Z', { costMicros: 600, inputTokens: 60, outputTokens: 24 }));
  await client.put(usageRow('fam2', '2026-07-06T00:00:00.000Z', { costMicros: 400, inputTokens: 40, outputTokens: 16 }));

  const alert: AlertPort = { publish: vi.fn(() => Promise.resolve()) };
  const metrics: MetricsPort = { emit: vi.fn(() => Promise.resolve()) };
  const deps: ReconcileDeps = {
    data,
    baseClient: client,
    // Default: July matches app exactly, June is zero-vs-zero — no breach.
    costExplorer: fakeCostExplorer({ '2026-07-01': 1000, '2026-06-01': 0 }),
    logs: fakeLogs({ inputTokens: 100, outputTokens: 40 }),
    alert,
    metrics,
    now: () => NOW,
    thresholdPct: 5,
    ...over,
  };
  const result = await runReconciliation(deps);
  return { client, data, alert, metrics, result };
}

describe('runReconciliation', () => {
  it('writes per-tenant rollup rows with correct sums for the current month', async () => {
    const { client } = await harness();
    const r1 = await client.get('GLOBAL#USAGE', 'ROLLUP#2026-07#T#fam1');
    const r2 = await client.get('GLOBAL#USAGE', 'ROLLUP#2026-07#T#fam2');
    expect(r1).toMatchObject({ tenantId: 'fam1', familyName: 'Alpha', costMicros: 600, inputTokens: 60, calls: 1, month: '2026-07' });
    expect(r2).toMatchObject({ tenantId: 'fam2', familyName: 'Beta', costMicros: 400, inputTokens: 40, calls: 1 });
    expect(r1?.computedAt).toBe(NOW);
  });

  it('writes a reconciliation status row carrying app/aws cost, drift, tokens, breach, caveat', async () => {
    const { client } = await harness();
    const status = await client.get('GLOBAL#RECON', 'MONTH#2026-07');
    expect(status).toMatchObject({
      month: '2026-07',
      appCostMicros: 1000,
      awsCostMicros: 1000,
      driftPct: 0,
      appTokens: 140, // 100 input + 40 output
      awsTokens: 140,
      breach: false,
      computedAt: NOW,
    });
    expect(String(status?.caveat)).toContain('Cost Explorer');
  });

  it('alerts when |drift| exceeds the threshold', async () => {
    // July AWS = 500µ$ vs app 1000µ$ → +100% drift → breach.
    const { alert, client } = await harness({
      costExplorer: fakeCostExplorer({ '2026-07-01': 500, '2026-06-01': 0 }),
    });
    expect(alert.publish).toHaveBeenCalledTimes(1);
    const status = await client.get('GLOBAL#RECON', 'MONTH#2026-07');
    expect(status?.breach).toBe(true);
    expect(status?.driftPct).toBe(100);
  });

  it('does NOT alert when drift is within the threshold', async () => {
    const { alert } = await harness(); // July matches, June zero-vs-zero
    expect(alert.publish).not.toHaveBeenCalled();
  });

  it('emits metrics on every run (once per month window)', async () => {
    const { metrics } = await harness();
    expect(metrics.emit).toHaveBeenCalledTimes(2); // current + prior month
    expect(metrics.emit).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-07' }));
    expect(metrics.emit).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-06' }));
  });

  it('is deterministic on injected now — computes exactly the current + prior windows', async () => {
    const { result } = await harness();
    expect(result.months.map((m) => m.month)).toEqual(['2026-07', '2026-06']);
    expect(result.months[1]).toMatchObject({ month: '2026-06', appCostMicros: 0, tenants: 2 });
  });

  it('marks actualsAvailable:true on the status row when AWS actuals succeed', async () => {
    const { client } = await harness();
    const status = await client.get('GLOBAL#RECON', 'MONTH#2026-07');
    expect(status?.actualsAvailable).toBe(true);
  });

  describe('when AWS actuals are unavailable (Cost Explorer throws)', () => {
    const throwingCostExplorer: CostExplorerPort = {
      bedrockCostMicros: () => Promise.reject(new Error('ThrottlingException: rate exceeded')),
    };

    it('still writes the per-tenant rollups (app-side recompute is independent of AWS)', async () => {
      const { client } = await harness({ costExplorer: throwingCostExplorer });
      const r1 = await client.get('GLOBAL#USAGE', 'ROLLUP#2026-07#T#fam1');
      const r2 = await client.get('GLOBAL#USAGE', 'ROLLUP#2026-07#T#fam2');
      expect(r1).toMatchObject({ costMicros: 600, calls: 1 });
      expect(r2).toMatchObject({ costMicros: 400, calls: 1 });
    });

    it('writes a status row with actualsAvailable:false, null aws/drift, breach false', async () => {
      const { client } = await harness({ costExplorer: throwingCostExplorer });
      const status = await client.get('GLOBAL#RECON', 'MONTH#2026-07');
      expect(status).toMatchObject({
        month: '2026-07',
        appCostMicros: 1000, // app side still summed
        actualsAvailable: false,
        breach: false,
      });
      expect(status?.awsCostMicros).toBeNull();
      expect(status?.driftPct).toBeNull();
      expect(status?.awsTokens).toBeNull();
    });

    it('does NOT alert (no baseline to reconcile) but STILL emits metrics', async () => {
      const { alert, metrics } = await harness({ costExplorer: throwingCostExplorer });
      expect(alert.publish).not.toHaveBeenCalled();
      expect(metrics.emit).toHaveBeenCalledTimes(2); // both windows still emit app-side metrics
      expect(metrics.emit).toHaveBeenCalledWith(
        expect.objectContaining({ month: '2026-07', appCostMicros: 1000, awsCostMicros: null, driftPct: null }),
      );
    });
  });
});

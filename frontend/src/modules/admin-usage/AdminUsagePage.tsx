import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, Card, EmptyState, Field, Input, Select, Spinner, Table, type Column } from '../../shared/ui';
import { formatUsd, getUsage } from './api';
import type { GroupBy, UsageBucket, UsageResponse } from './types';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'student', label: 'Student' },
  { value: 'model', label: 'Model' },
  { value: 'day', label: 'Day' },
];

/** Current calendar month as a [from, to) UTC range. `to` is first-of-NEXT-month at 00:00:00.000Z so
 *  millisecond-precision rows on the last day of the month are still included. */
function currentMonthRange(now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1)).toISOString(),
    to: new Date(Date.UTC(y, m + 1, 1)).toISOString(),
  };
}

/** Admin-only per-family Bedrock token-cost report. Visible to tenant admins AND the platform admin
 *  (nav gates on roles:['admin']); the platform admin additionally gets a tenant override input. */
export default function AdminUsagePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || Boolean(user?.platformAdmin);
  const isPlatformAdmin = Boolean(user?.platformAdmin);

  const range = useMemo(() => currentMonthRange(), []);
  const [groupBy, setGroupBy] = useState<GroupBy>('feature');
  const [tenantId, setTenantId] = useState('');
  const [tenantInput, setTenantInput] = useState('');
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await getUsage({
          groupBy,
          from: range.from,
          to: range.to,
          tenantId: isPlatformAdmin && tenantId ? tenantId : undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage.');
    } finally {
      setLoading(false);
    }
  }, [groupBy, range.from, range.to, isPlatformAdmin, tenantId]);

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          icon="warning"
          title="Admins only"
          description="This usage report is restricted to family admins."
        />
      </div>
    );
  }

  const columns: Column<UsageBucket>[] = [
    { key: 'key', header: keyHeader(groupBy), render: (b) => <span className="font-medium text-ink-900">{b.key}</span> },
    { key: 'calls', header: 'Calls', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.calls.toLocaleString()}</span> },
    { key: 'input', header: 'Input tokens', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.inputTokens.toLocaleString()}</span> },
    { key: 'output', header: 'Output tokens', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.outputTokens.toLocaleString()}</span> },
    { key: 'cost', header: 'Cost', align: 'right', render: (b) => <span className="font-semibold tabular-nums text-ink-900">{formatUsd(b.costMicros)}</span> },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Usage</h1>
        <p className="text-sm text-ink-600">
          Bedrock token cost for this family, {range.from.slice(0, 7)}. Broken down by the dimension you choose.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Group by" className="w-40">
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {GROUP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {isPlatformAdmin ? (
          <Field label="Tenant (platform admin)" className="w-56">
            <div className="flex gap-2">
              <Input
                value={tenantInput}
                onChange={(e) => setTenantInput(e.target.value)}
                placeholder="own family"
              />
              <Button variant="outline" onClick={() => setTenantId(tenantInput.trim())}>
                Load
              </Button>
            </div>
          </Field>
        ) : null}
      </div>

      <div className="min-w-0 border-t border-surface-border pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Total cost · {range.from.slice(0, 7)}
        </p>
        <p className="mt-1.5 font-display text-3xl font-bold leading-none text-ink-900">
          {data ? formatUsd(data.totalCostMicros) : '—'}
        </p>
        {data ? (
          <p className="mt-1.5 text-xs text-ink-400">
            {data.totalInputTokens.toLocaleString()} input · {data.totalOutputTokens.toLocaleString()} output tokens
          </p>
        ) : null}
      </div>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-raised">
          <Table
            columns={columns}
            rows={data?.buckets ?? []}
            rowKey={(b) => b.key}
            empty="No usage recorded in this range yet."
          />
        </div>
      )}
    </div>
  );
}

function keyHeader(groupBy: GroupBy): string {
  switch (groupBy) {
    case 'feature':
      return 'Feature';
    case 'student':
      return 'Student';
    case 'model':
      return 'Model';
    case 'day':
      return 'Day';
  }
}

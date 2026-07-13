import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, Card, EmptyState, Field, Select, Spinner, Table, type Column } from '../../shared/ui';
import { formatUsd, getFamiliesUsage, getUsage } from './api';
import type { FamiliesUsageResponse, FamilyUsageRow, GroupBy, UsageBucket, UsageResponse } from './types';

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

/** Admin-only per-family Bedrock token-cost report. A tenant admin lands straight on their own family's
 *  breakdown. The platform admin instead opens on an "All families" ranking and drills into any family's
 *  breakdown by clicking its row (with a back link to return to the ranking). */
export default function AdminUsagePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || Boolean(user?.platformAdmin);
  const isPlatformAdmin = Boolean(user?.platformAdmin);

  const range = useMemo(() => currentMonthRange(), []);
  // Platform admin starts on the all-families ranking; a tenant admin only ever sees their own family.
  const [viewMode, setViewMode] = useState<'families' | 'family'>(isPlatformAdmin ? 'families' : 'family');
  const [groupBy, setGroupBy] = useState<GroupBy>('feature');
  const [tenantId, setTenantId] = useState(''); // the drilled-into family (platform admin only)
  const [data, setData] = useState<UsageResponse | null>(null);
  const [families, setFamilies] = useState<FamiliesUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFamily = useCallback(async () => {
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

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFamilies(await getFamiliesUsage({ from: range.from, to: range.to }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage.');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    if (viewMode === 'families') void loadFamilies();
    else void loadFamily();
  }, [isAdmin, viewMode, loadFamilies, loadFamily]);

  const drillInto = (row: FamilyUsageRow) => {
    setTenantId(row.tenantId);
    setViewMode('family');
  };
  const backToFamilies = () => {
    setTenantId('');
    setData(null);
    setViewMode('families');
  };
  const retry = () => (viewMode === 'families' ? void loadFamilies() : void loadFamily());

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

  const bucketColumns: Column<UsageBucket>[] = [
    { key: 'key', header: keyHeader(groupBy), render: (b) => <span className="font-medium text-ink-900">{b.key}</span> },
    { key: 'calls', header: 'Calls', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.calls.toLocaleString()}</span> },
    { key: 'input', header: 'Input tokens', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.inputTokens.toLocaleString()}</span> },
    { key: 'output', header: 'Output tokens', align: 'right', render: (b) => <span className="tabular-nums text-ink-700">{b.outputTokens.toLocaleString()}</span> },
    { key: 'cost', header: 'Cost', align: 'right', render: (b) => <span className="font-semibold tabular-nums text-ink-900">{formatUsd(b.costMicros)}</span> },
  ];

  const familyColumns: Column<FamilyUsageRow>[] = [
    { key: 'family', header: 'Family', render: (f) => <span className="font-medium text-ink-900">{f.familyName}</span> },
    { key: 'calls', header: 'Calls', align: 'right', render: (f) => <span className="tabular-nums text-ink-700">{f.calls.toLocaleString()}</span> },
    { key: 'input', header: 'Input tokens', align: 'right', render: (f) => <span className="tabular-nums text-ink-700">{f.inputTokens.toLocaleString()}</span> },
    { key: 'output', header: 'Output tokens', align: 'right', render: (f) => <span className="tabular-nums text-ink-700">{f.outputTokens.toLocaleString()}</span> },
    { key: 'cost', header: 'Cost', align: 'right', render: (f) => <span className="font-semibold tabular-nums text-ink-900">{formatUsd(f.costMicros)}</span> },
  ];

  const showFamilies = viewMode === 'families';
  const headlineCost = showFamilies ? families?.totalCostMicros : data?.totalCostMicros;
  const headlineInput = showFamilies ? families?.totalInputTokens : data?.totalInputTokens;
  const headlineOutput = showFamilies ? families?.totalOutputTokens : data?.totalOutputTokens;
  const hasHeadline = showFamilies ? Boolean(families) : Boolean(data);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Usage</h1>
        <p className="text-sm text-ink-600">
          {showFamilies
            ? `Bedrock token cost across all families, ${range.from.slice(0, 7)}. Ranked by spend — click a family to drill in.`
            : `Bedrock token cost for this family, ${range.from.slice(0, 7)}. Broken down by the dimension you choose.`}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        {!showFamilies && isPlatformAdmin ? (
          <Button variant="outline" size="sm" onClick={backToFamilies}>
            ← All families
          </Button>
        ) : null}
        {!showFamilies ? (
          <Field label="Group by" className="w-40">
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              {GROUP_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="min-w-0 border-t border-surface-border pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {showFamilies ? 'Total cost · all families' : 'Total cost'} · {range.from.slice(0, 7)}
        </p>
        <p className="mt-1.5 font-display text-3xl font-bold leading-none text-ink-900">
          {headlineCost !== undefined ? formatUsd(headlineCost) : '—'}
        </p>
        {hasHeadline ? (
          <p className="mt-1.5 text-xs text-ink-400">
            {(headlineInput ?? 0).toLocaleString()} input · {(headlineOutput ?? 0).toLocaleString()} output tokens
          </p>
        ) : null}
      </div>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : showFamilies ? (
        <div className="rounded-xl border border-surface-border bg-surface-raised">
          <Table
            columns={familyColumns}
            rows={families?.families ?? []}
            rowKey={(f) => f.tenantId}
            onRowClick={drillInto}
            empty="No families have recorded usage in this range yet."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-raised">
          <Table
            columns={bucketColumns}
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

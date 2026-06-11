import { useState } from 'react';
import { Card, Field, Input } from '../../shared/ui';
import { benchmarkProgress, formatHours, monthLabel, toSortedRows } from './logic';
import type { ExperienceSummary } from './types';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <div className="text-3xl font-bold text-primary-700">{value}</div>
      <div className="mt-1 text-sm text-ink-500">{label}</div>
    </Card>
  );
}

function Bars({ title, byKey, emptyText }: { title: string; byKey: Record<string, number>; emptyText: string }) {
  const rows = toSortedRows(byKey);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold text-ink-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-sm text-ink-700" title={row.key}>
                {row.key}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-primary-500"
                  style={{ width: `${Math.round((row.value / max) * 100)}%` }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-600">
                {formatHours(row.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Total-hours headline, by-facility / by-department bars, monthly trend, patient-vs-observational
 *  split, and an editable benchmark target. All numbers are visibility-filtered server-side. */
export function SummaryView({ summary }: { summary: ExperienceSummary }) {
  const [target, setTarget] = useState('');
  const targetNum = target.trim() ? Number(target) : undefined;
  const bench = benchmarkProgress(summary.totalHours, Number.isNaN(targetNum) ? undefined : targetNum);

  const monthRows = Object.entries(summary.hoursByMonth).sort(([a], [b]) => (a < b ? -1 : 1));
  const maxMonth = monthRows.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  const piPct =
    summary.totalHours > 0 ? Math.round((summary.patientInteractionHours / summary.totalHours) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total hours" value={formatHours(summary.totalHours)} />
        <StatCard label="Entries" value={summary.totalEntries} />
        <StatCard label="Patient-care hrs" value={formatHours(summary.patientInteractionHours)} />
        <StatCard label="Facilities" value={Object.keys(summary.hoursByFacility).length} />
      </div>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Program benchmark</h3>
        <Field
          label="Target hours"
          hint="Set the hours your target program expects (live program targets arrive with Peer Benchmark)."
          className="max-w-xs"
        >
          <Input
            type="number"
            min={0}
            placeholder="e.g. 150"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        {bench ? (
          <div className="mt-3">
            <div className="h-4 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-success-500" style={{ width: `${bench.pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {formatHours(summary.totalHours)} of {target} hours ({bench.pct}%).{' '}
              {bench.remaining > 0 ? `${formatHours(bench.remaining)} to go.` : 'Target reached!'}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-500">Enter a target to see how close you are.</p>
        )}
      </Card>

      <Bars title="Hours by facility" byKey={summary.hoursByFacility} emptyText="No hours logged yet." />
      <Bars title="Hours by department" byKey={summary.hoursByDepartment} emptyText="No hours logged yet." />

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Patient interaction</h3>
        {summary.totalHours === 0 ? (
          <p className="text-sm text-ink-500">No hours logged yet.</p>
        ) : (
          <>
            <div className="flex h-4 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full bg-success-500" style={{ width: `${piPct}%` }} title="Patient interaction" />
            </div>
            <p className="mt-2 text-sm text-ink-600">
              {formatHours(summary.patientInteractionHours)} patient-interaction ·{' '}
              {formatHours(summary.observationalHours)} observational
            </p>
          </>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Hours over time</h3>
        {monthRows.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing logged yet.</p>
        ) : (
          <div className="flex items-end gap-2">
            {monthRows.map(([key, hours]) => (
              <div key={key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-secondary-400"
                  style={{ height: `${8 + Math.round((hours / maxMonth) * 88)}px` }}
                  title={`${formatHours(hours)} hrs`}
                />
                <div className="text-[10px] text-ink-500">{monthLabel(key)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

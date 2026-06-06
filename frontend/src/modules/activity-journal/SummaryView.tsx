import { Card } from '../../shared/ui';
import { CATEGORY_META, monthLabel, toSortedRows } from './logic';
import type { ActivitySummary, Category } from './types';

const isCategory = (k: string): k is Category => k in CATEGORY_META;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <div className="text-3xl font-bold text-primary-700">{value}</div>
      <div className="mt-1 text-sm text-ink-500">{label}</div>
    </Card>
  );
}

/** Hours-by-category bars + entries-over-time, all visibility-filtered server-side. */
export function SummaryView({ summary }: { summary: ActivitySummary }) {
  const hoursRows = toSortedRows(summary.hoursByCategory);
  const maxHours = hoursRows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  const monthRows = Object.entries(summary.countsByMonth).sort(([a], [b]) => (a < b ? -1 : 1));
  const maxMonth = monthRows.reduce((m, [, v]) => Math.max(m, v), 0) || 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total entries" value={summary.totalCount} />
        <StatCard label="Total hours" value={summary.totalHours} />
        <StatCard label="Categories" value={Object.keys(summary.countsByCategory).length} />
      </div>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Hours by category</h3>
        {hoursRows.length === 0 ? (
          <p className="text-sm text-ink-500">No hours logged yet.</p>
        ) : (
          <div className="space-y-2">
            {hoursRows.map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-sm text-ink-700">
                  {isCategory(row.key) ? CATEGORY_META[row.key].label : row.key}
                </div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((row.value / maxHours) * 100)}%` }}
                  />
                </div>
                <div className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-600">{row.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink-900">Entries over time</h3>
        {monthRows.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing logged yet.</p>
        ) : (
          <div className="flex items-end gap-2">
            {monthRows.map(([key, count]) => (
              <div key={key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-secondary-400"
                  style={{ height: `${8 + Math.round((count / maxMonth) * 88)}px` }}
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

import { Badge, Card } from '../../shared/ui';
import { fmtGpa, fmtNum, monthLabel, summarizeTrend, totalGaps } from './logic';
import type { BenchmarkSnapshot } from './types';

/** Progress over time (spec Module 16 — "are gaps closing?"). Renders the monthly snapshots as a
 *  compact table plus a first-vs-latest headline. One snapshot is captured per calendar month when
 *  this dashboard loads, so the trend fills in on its own over the application year. */
export function ProgressTrend({ trend }: { trend: BenchmarkSnapshot[] }) {
  if (trend.length === 0) return null;

  const summary = summarizeTrend(trend);
  const rows = [...trend].reverse(); // newest first in the table

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-800">Progress over time</h3>
        {summary ? (
          <Badge tone={summary.gapsDelta < 0 ? 'success' : summary.gapsDelta > 0 ? 'warn' : 'neutral'}>
            {summary.gapsDelta < 0
              ? `${-summary.gapsDelta} gap${-summary.gapsDelta === 1 ? '' : 's'} closed since ${monthLabel(summary.first.month)}`
              : summary.gapsDelta > 0
                ? `${summary.gapsDelta} more gap${summary.gapsDelta === 1 ? '' : 's'} than ${monthLabel(summary.first.month)}`
                : 'Holding steady'}
          </Badge>
        ) : null}
      </div>

      {trend.length < 2 ? (
        <p className="text-sm text-ink-500">
          First monthly snapshot recorded. Check back next month to see how your gaps are closing.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="p-2 font-medium">Month</th>
              <th className="p-2 text-right font-medium">GPA</th>
              <th className="p-2 text-right font-medium">TEAS</th>
              <th className="p-2 text-right font-medium">Clinical</th>
              <th className="p-2 text-right font-medium">Volunteer</th>
              <th className="p-2 text-right font-medium">Certs</th>
              <th className="p-2 text-right font-medium">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.month} className="border-t border-surface-border">
                <td className="p-2 font-medium text-ink-900">{monthLabel(s.month)}</td>
                <td className="p-2 text-right tabular-nums text-ink-700">{fmtGpa(s.gpa)}</td>
                <td className="p-2 text-right tabular-nums text-ink-700">{s.teasScore === undefined ? '—' : fmtNum(s.teasScore)}</td>
                <td className="p-2 text-right tabular-nums text-ink-700">{fmtNum(s.clinicalHours)}h</td>
                <td className="p-2 text-right tabular-nums text-ink-700">{fmtNum(s.volunteerHours)}h</td>
                <td className="p-2 text-right tabular-nums text-ink-700">{s.certCount}</td>
                <td className="p-2 text-right">
                  <Badge tone={totalGaps(s) === 0 ? 'success' : 'warn'}>{totalGaps(s)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-400">
        Gaps = metrics where you’re below the typical admitted student, summed across your colleges.
        Lower is better.
      </p>
    </Card>
  );
}

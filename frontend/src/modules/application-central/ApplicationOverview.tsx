import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, Icon, Spinner } from '../../shared/ui';
import { deadlineLabel, essaySummary } from './logic';
import { getOverview } from './api';
import type { ApplicationRow } from './types';

/** Read-only application tracker: one row per active college — deadline countdown, essay progress,
 *  and whether an exam score exists. Derived from colleges + essays + exams (no separate storage). */
export function ApplicationOverview() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await getOverview());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your applications.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="application"
        title="No colleges to track yet"
        description="Add target colleges in the College Hub — they’ll appear here with deadline countdowns and essay progress."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-sunken text-left text-ink-500">
          <tr>
            <th className="p-2 font-medium">College</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">Deadline</th>
            <th className="p-2 font-medium">Essays</th>
            <th className="p-2 font-medium">Exam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dl = deadlineLabel(r);
            const es = essaySummary(r);
            return (
              <tr key={r.collegeId} className="border-t border-surface-border">
                <td className="p-2">
                  <span className="flex items-center gap-1.5 font-medium text-ink-900">
                    {r.isTopPick ? <Icon name="star" size={14} className="text-warn-500" /> : null}
                    {r.name}
                  </span>
                </td>
                <td className="p-2 text-ink-700">{r.status ?? '—'}</td>
                <td className="p-2">{dl ? <Badge tone={dl.tone}>{dl.text}</Badge> : <span className="text-ink-400">—</span>}</td>
                <td className="p-2"><Badge tone={es.tone}>{es.text}</Badge></td>
                <td className="p-2">{r.hasExamScore ? <Icon name="check" size={16} className="text-success-600" /> : <span className="text-ink-400">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

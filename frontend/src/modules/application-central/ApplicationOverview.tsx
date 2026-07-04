import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, Spinner } from '../../shared/ui';
import { deadlineLabel, essaySummary } from './logic';
import { getOverview } from './api';
import type { ApplicationRow } from './types';

interface Props {
  /** Jump to the Essays tab with this college preselected in the new-essay flow. */
  onStartEssay: (collegeId: string) => void;
  /** Jump to the Essays tab (essays already exist for this college). */
  onViewEssays: (collegeId: string) => void;
}

/** Application tracker: one row per active college — deadline countdown, essay progress, exam
 *  status — with a direct call to action per row (start/continue the essay; college name links to
 *  the full profile). Derived from colleges + essays + exams (no separate storage). */
export function ApplicationOverview({ onStartEssay, onViewEssays }: Props) {
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
    <div className="space-y-3">
      <p className="text-sm text-ink-600">
        One row per target college. Tap a name for its full profile, or jump straight into that
        school’s essay — the AI coach picks up the college automatically.
      </p>

      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-sunken text-left text-ink-500">
            <tr>
              <th className="p-2 font-medium">College</th>
              <th className="p-2 font-medium">Deadline</th>
              <th className="hidden p-2 font-medium sm:table-cell">Essays</th>
              <th className="hidden p-2 font-medium sm:table-cell">Exam</th>
              <th className="p-2 font-medium"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dl = deadlineLabel(r);
              const es = essaySummary(r);
              const hasEssays = r.essays.total > 0;
              return (
                <tr key={r.collegeId} className="border-t border-surface-border">
                  <td className="p-2">
                    <Link
                      to={`/colleges/${encodeURIComponent(r.collegeId)}`}
                      className="flex items-center gap-1.5 font-medium text-ink-900 hover:text-primary-700 hover:underline"
                    >
                      {r.isTopPick ? <Icon name="star" size={14} className="text-warn-500" /> : null}
                      {r.name}
                    </Link>
                    <span className="text-xs capitalize text-ink-400">{r.status ?? ''}</span>
                  </td>
                  <td className="p-2">{dl ? <Badge tone={dl.tone}>{dl.text}</Badge> : <span className="text-ink-400">—</span>}</td>
                  <td className="hidden p-2 sm:table-cell"><Badge tone={es.tone}>{es.text}</Badge></td>
                  <td className="hidden p-2 sm:table-cell">{r.hasExamScore ? <Icon name="check" size={16} className="text-success-600" /> : <span className="text-ink-400">—</span>}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant={hasEssays ? 'outline' : 'primary'}
                      onClick={() => (hasEssays ? onViewEssays(r.collegeId) : onStartEssay(r.collegeId))}
                    >
                      {hasEssays ? 'Essays →' : 'Start essay'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Spinner } from '../../shared/ui';
import { getAggregate, getGaps } from './api';
import { AggregateMatrix } from './AggregateMatrix';
import { BenchmarkCard } from './BenchmarkCard';
import { GapsCallout } from './GapsCallout';
import { ProgressTrend } from './ProgressTrend';
import { fmtGpa, fmtNum, READINESS_META } from './logic';
import { DEFAULT_BENCHMARK_LABELS, type AggregateMatrix as Matrix, type GapsAnalysis, type Readiness } from './types';

const READINESS_ORDER: Readiness[] = ['strong', 'competitive', 'needs-work', 'insufficient-data'];

/** Peer Benchmark — standalone aggregate dashboard: Keira's snapshot, the color-coded matrix
 *  (all colleges × metrics), a current-standing rollup, and the AI biggest-gaps analysis. */
export default function PeerBenchmarkPage() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gaps, setGaps] = useState<GapsAnalysis | null>(null);
  const [gapsLoading, setGapsLoading] = useState(true);
  const [gapsError, setGapsError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMatrix(await getAggregate());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the benchmark matrix.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGaps = useCallback(async () => {
    setGapsLoading(true);
    setGapsError(null);
    try {
      setGaps(await getGaps());
    } catch (err) {
      setGaps(null);
      setGapsError(err instanceof Error ? err.message : 'The gaps analysis is unavailable right now.');
    } finally {
      setGapsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatrix();
    void loadGaps();
  }, [loadMatrix, loadGaps]);

  const rows = matrix?.rows ?? [];
  const keira = matrix?.keira;
  const trend = matrix?.trend ?? [];
  const labels = matrix?.labels ?? DEFAULT_BENCHMARK_LABELS;

  // Current-standing rollup: the at-a-glance readiness distribution right now. Month-over-month
  // history is shown separately by <ProgressTrend> from the persisted monthly snapshots.
  const standing = useMemo(() => {
    const counts: Record<Readiness, number> = { strong: 0, competitive: 0, 'needs-work': 0, 'insufficient-data': 0 };
    for (const r of rows) counts[r.comparison.overallReadiness ?? 'insufficient-data'] += 1;
    return counts;
  }, [rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Peer Benchmark</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          What a competitive admitted student looks like at each school — and where you stand.
        </p>
      </header>

      {keira ? (
        <Card flush className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Your stats</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-ink-700">GPA <strong className="tabular-nums">{fmtGpa(keira.gpa)}</strong></span>
            {labels.exam ? (
              <span className="text-ink-700">{labels.exam} <strong className="tabular-nums">{keira.teasScore === undefined ? 'not taken' : fmtNum(keira.teasScore)}</strong></span>
            ) : null}
            <span className="text-ink-700">{labels.experience} <strong className="tabular-nums">{fmtNum(keira.clinicalHours)}h</strong></span>
            <span className="text-ink-700">Volunteer <strong className="tabular-nums">{fmtNum(keira.volunteerHours)}h</strong></span>
            <span className="text-ink-700">Certifications <strong className="tabular-nums">{keira.certifications.length}</strong></span>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void loadMatrix()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="goal"
          title="No colleges to benchmark yet"
          description="Add target colleges in College Hub, then refresh a benchmark to see how you compare to a competitive admitted student."
        />
      ) : (
        <>
          <Card flush className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Your standing</span>
              {READINESS_ORDER.map((r) =>
                standing[r] > 0 ? (
                  <Badge key={r} tone={READINESS_META[r].tone}>
                    {standing[r]} {READINESS_META[r].label}
                  </Badge>
                ) : null,
              )}
            </div>
          </Card>

          <Card flush className="p-2">
            <AggregateMatrix
              rows={rows}
              keira={keira!}
              labels={labels}
              onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
              expandedId={selected}
              renderExpanded={(r) => (
                <BenchmarkCard
                  collegeId={r.collegeId}
                  // When a research run finishes, reload the matrix + gaps so the Readiness column and
                  // your-standing rollup update without a manual page refresh.
                  onResearched={() => {
                    void loadMatrix();
                    void loadGaps();
                  }}
                />
              )}
            />
            <p className="px-3 pb-2 pt-1 text-xs text-ink-400">
              Each cell shows <span className="tabular-nums">your value / typical admitted student</span>. Green exceeds ·
              yellow meets · red below · gray no data. Tap a row to expand it and run or view that school's benchmark.
            </p>
          </Card>

          <GapsCallout analysis={gaps} loading={gapsLoading} error={gapsError} onRetry={() => void loadGaps()} />

          {trend.length > 0 ? <ProgressTrend trend={trend} labels={labels} /> : null}
        </>
      )}
    </div>
  );
}

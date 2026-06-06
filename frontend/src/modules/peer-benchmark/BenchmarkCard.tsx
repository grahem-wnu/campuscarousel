import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Spinner, useToast } from '../../shared/ui';
import { getBenchmark, refreshBenchmark } from './api';
import { cellText, readinessMeta, statusMeta } from './logic';
import type { BenchmarkDetail, MetricStatus, TeasStatus } from './types';

/** One metric row: label, "keira / school" values, and a color-coded status badge. */
function MetricRow({
  label,
  keira,
  school,
  status,
  gpa,
}: {
  label: string;
  keira: number | undefined;
  school: number | undefined;
  status: TeasStatus | undefined;
  gpa?: boolean;
}) {
  const meta = statusMeta(status);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-ink-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-sm text-ink-800">{cellText(keira, school, gpa)}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
    </div>
  );
}

/** Per-college benchmark comparison card: school typical vs Keira's, readiness badge, refresh.
 *  Self-contained — college-hub can mount this in its detail tab; it consumes the public API. */
export function BenchmarkCard({ collegeId }: { collegeId: string }) {
  const toast = useToast();
  const [detail, setDetail] = useState<BenchmarkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getBenchmark(collegeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the benchmark.');
    } finally {
      setLoading(false);
    }
  }, [collegeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      setDetail(await refreshBenchmark(collegeId));
      toast.success('Benchmark refreshed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refresh the benchmark.');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <Card className="flex justify-center py-10">
        <Spinner />
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="border border-error-200 bg-error-50 text-error-700">
        <p className="text-sm">{error}</p>
        <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }
  if (!detail) return null;

  const { benchmark, keira, comparison } = detail;
  const readiness = readinessMeta(comparison.overallReadiness);
  const clin = comparison.clinicalHoursStatus as MetricStatus | undefined;
  const vol = comparison.volunteerHoursStatus as MetricStatus | undefined;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-ink-900">{detail.college.name}</h3>
          <Badge tone={readiness.tone} solid>
            {readiness.label}
          </Badge>
        </div>
        <Button size="sm" variant="outline" icon="search" loading={refreshing} onClick={() => void refresh()}>
          Refresh Benchmark
        </Button>
      </div>

      {benchmark ? (
        <>
          <div className="mt-3 divide-y divide-surface-border">
            <MetricRow label="GPA" keira={keira.gpa} school={benchmark.avgGPAAdmitted} status={comparison.gpaStatus} gpa />
            <MetricRow label="TEAS" keira={keira.teasScore} school={benchmark.avgTEASScore} status={comparison.teasStatus} />
            <MetricRow label="Clinical hours" keira={keira.clinicalHours} school={benchmark.typicalClinicalHours} status={clin} />
            <MetricRow label="Volunteer hours" keira={keira.volunteerHours} school={benchmark.typicalVolunteerHours} status={vol} />
          </div>
          <p className="mt-2 text-xs text-ink-400">Keira / typical admitted student.</p>

          {benchmark.typicalCertifications && benchmark.typicalCertifications.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-ink-600">Typical certifications</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {benchmark.typicalCertifications.map((c) => (
                  <Badge key={c} tone={keira.certifications.includes(c) ? 'success' : 'neutral'}>
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {benchmark.competitiveEdges && benchmark.competitiveEdges.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-ink-600">Competitive edges</p>
              <ul className="mt-1 list-inside list-disc text-sm text-ink-700">
                {benchmark.competitiveEdges.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {benchmark.typicalExtracurriculars ? (
            <p className="mt-3 text-sm text-ink-700">
              <span className="text-xs font-medium text-ink-600">Typical extracurriculars: </span>
              {benchmark.typicalExtracurriculars}
            </p>
          ) : null}

          {benchmark.lastDataRefresh ? (
            <p className="mt-3 text-xs text-ink-400">Last researched {benchmark.lastDataRefresh.slice(0, 10)}.</p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-500">
          No benchmark yet. Use <strong>Refresh Benchmark</strong> to research the competitive profile for this school.
        </p>
      )}
    </Card>
  );
}

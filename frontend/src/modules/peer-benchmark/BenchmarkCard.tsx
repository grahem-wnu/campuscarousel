import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Spinner, useToast } from '../../shared/ui';
import { useActiveStudent } from '../../shared/shell';
import { getBenchmark, getRefreshStatus, startBenchmarkRefresh } from './api';
import { cellText, readinessMeta, statusMeta } from './logic';
import type { BenchmarkDetail, MetricStatus, TeasStatus } from './types';

const POLL_MS = 3000;
const MAX_POLLS = 60; // ~3 min — web-grounded research runs on the 300s worker but is usually <90s

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
  const { activeStudent } = useActiveStudent();
  const studentName = activeStudent?.name ?? 'This student';
  const [detail, setDetail] = useState<BenchmarkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Guards against setState after the card unmounts mid-poll (the research can run ~90s).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getBenchmark(collegeId);
      if (aliveRef.current) setDetail(d);
    } catch (err) {
      if (aliveRef.current) setError(err instanceof Error ? err.message : 'Could not load the benchmark.');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [collegeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh is ASYNC: the web-grounded research runs on the worker (it exceeds the 30s request
  // budget), so we start a job and poll until it settles, then reload the benchmark.
  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      const job = await startBenchmarkRefresh(collegeId);
      let current = job;
      for (let i = 0; current.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!aliveRef.current) return;
        current = await getRefreshStatus(collegeId, job.jobId);
      }
      if (current.status === 'failed') {
        toast.error(current.error || 'Could not refresh the benchmark. Please try again.');
        return;
      }
      if (current.status === 'pending') {
        toast.error('Research is taking longer than expected — please try again in a moment.');
        return;
      }
      await load();
      if (aliveRef.current) toast.success('Benchmark refreshed.');
    } catch (err) {
      if (aliveRef.current) toast.error(err instanceof Error ? err.message : 'Could not refresh the benchmark.');
    } finally {
      if (aliveRef.current) setRefreshing(false);
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
          {refreshing ? 'Researching…' : 'Refresh Benchmark'}
        </Button>
      </div>

      {refreshing ? (
        <p className="mt-3 text-sm text-ink-500">
          Researching the typical admitted-student profile for {detail.college.name} on the web — this
          usually takes up to a minute. You can leave this page; the result is saved when it finishes.
        </p>
      ) : null}

      {benchmark ? (
        <>
          <div className="mt-3 divide-y divide-surface-border">
            <MetricRow label="GPA" keira={keira.gpa} school={benchmark.avgGPAAdmitted} status={comparison.gpaStatus} gpa />
            <MetricRow label="TEAS" keira={keira.teasScore} school={benchmark.avgTEASScore} status={comparison.teasStatus} />
            <MetricRow label="Clinical hours" keira={keira.clinicalHours} school={benchmark.typicalClinicalHours} status={clin} />
            <MetricRow label="Volunteer hours" keira={keira.volunteerHours} school={benchmark.typicalVolunteerHours} status={vol} />
          </div>
          <p className="mt-2 text-xs text-ink-400">{studentName} / typical admitted student.</p>

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
      ) : refreshing ? null : (
        <div className="mt-3 space-y-3 text-sm text-ink-600">
          <p>
            This card compares {studentName}&rsquo;s profile against a typical admitted student at{' '}
            {detail.college.name}. To use it:
          </p>
          <ol className="list-inside list-decimal space-y-1 text-ink-700">
            <li>
              Click <strong>Refresh Benchmark</strong> above — it researches the school&rsquo;s typical
              admitted-student profile (GPA, TEAS, clinical &amp; volunteer hours, certifications) on the web.
            </li>
            <li>
              Fill in {studentName}&rsquo;s own data in the other modules — it&rsquo;s pulled in automatically:
              <span className="text-ink-600">
                {' '}GPA from <strong>Course Planner</strong>, TEAS from <strong>Exam Prep</strong>,
                clinical hours from <strong>Clinical Hours</strong>, volunteer hours from the{' '}
                <strong>Activity Journal</strong>, and earned <strong>Certifications</strong>.
              </span>
            </li>
          </ol>
          <p className="text-xs text-ink-400">
            The readiness badge stays <em>Insufficient Data</em> until both the school profile is researched and
            {studentName} has at least a couple of comparable metrics entered.
          </p>
        </div>
      )}
    </Card>
  );
}

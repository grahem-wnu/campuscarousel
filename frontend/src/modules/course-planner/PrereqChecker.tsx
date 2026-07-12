import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, Field, Select, Spinner } from '../../shared/ui';
import { listColleges } from '../college-hub/api';
import type { College } from '../college-hub/types';
import { getPrerequisites } from './api';
import { PrereqReportView } from './PrereqReportView';
import type { Course, PrereqReport } from './types';

/**
 * Per-college prerequisite drill-down — a focused, course-level breakdown that complements the full
 * coverage matrix (PrereqMatrix) shown above it. Pick one of the student's tracked colleges and it
 * hits `GET /courses/prerequisites/:collegeId`, listing each prerequisite with the course that
 * satisfies it (or flagging it as a gap). Picking from the roster means no hunting for a raw id.
 */
export function PrereqChecker({ courses }: { courses: Course[] }) {
  const [colleges, setColleges] = useState<College[] | null>(null);
  const [collegeId, setCollegeId] = useState('');
  const [report, setReport] = useState<PrereqReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courseName = (id: string): string => courses.find((c) => c.courseId === id)?.name ?? id;

  // Load the student's tracked colleges to populate the picker.
  useEffect(() => {
    listColleges()
      .then((list) => setColleges([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setColleges([]));
  }, []);

  // Run the check as soon as a college is picked — no separate submit step.
  async function check(id: string): Promise<void> {
    setCollegeId(id);
    setReport(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      setReport(await getPrerequisites(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check prerequisites.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        {colleges !== null && colleges.length === 0 ? (
          <p className="text-sm text-ink-500">
            No colleges to check yet — add one in the College Hub (with its program prerequisites) and it
            will show up here.
          </p>
        ) : (
          <Field
            label="College"
            hint="Pick a college to see how your courses cover its program prerequisites."
            className="min-w-[14rem]"
          >
            <Select value={collegeId} disabled={colleges === null} onChange={(e) => void check(e.target.value)}>
              <option value="">{colleges === null ? 'Loading colleges…' : 'Select a college…'}</option>
              {(colleges ?? []).map((c) => (
                <option key={c.collegeId} value={c.collegeId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {loading ? (
          <div className="flex items-center gap-2 pt-3 text-sm text-ink-500">
            <Spinner size={16} /> Checking prerequisites…
          </div>
        ) : null}
      </Card>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
        </Card>
      ) : report ? (
        report.totalCount === 0 ? (
          <EmptyState
            icon="info"
            title={`${report.collegeName ?? 'This college'} has no prerequisites listed`}
            description="Add prerequisites to the college in the College Hub to track coverage here."
          />
        ) : (
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink-900">{report.collegeName ?? report.collegeId}</h3>
              <Badge tone={report.satisfiedCount === report.totalCount ? 'success' : 'warn'}>
                {report.satisfiedCount} / {report.totalCount} met
              </Badge>
            </div>
            <PrereqReportView report={report} courseName={courseName} />
          </Card>
        )
      ) : loading ? null : (
        <EmptyState
          icon="school"
          title="Check prerequisites for a college"
          description="Pick a college above to see which of its program prerequisites your courses already cover, and which are still gaps."
        />
      )}
    </div>
  );
}

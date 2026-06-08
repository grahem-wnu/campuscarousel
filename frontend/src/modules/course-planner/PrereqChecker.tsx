import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, EmptyState, Field, Icon, Input } from '../../shared/ui';
import { getPrerequisites } from './api';
import type { Course, PrereqReport } from './types';

/**
 * Per-college prerequisite spot-check by id — a focused lookup that complements the full coverage
 * matrix (PrereqMatrix) shown above it. Hits `GET /courses/prerequisites/:collegeId` and highlights
 * the gaps for a single college, including ones not in the pursued set (e.g. while still researching).
 */
export function PrereqChecker({ courses }: { courses: Course[] }) {
  const [collegeId, setCollegeId] = useState('');
  const [report, setReport] = useState<PrereqReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courseName = (id: string): string => courses.find((c) => c.courseId === id)?.name ?? id;

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!collegeId.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      setReport(await getPrerequisites(collegeId.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check prerequisites.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <Field
            label="College ID"
            hint="Find a college's id in the College Hub. Checks how your courses cover its prerequisites."
            className="min-w-[14rem] flex-1"
          >
            <Input
              placeholder="e.g. the college's id"
              value={collegeId}
              onChange={(e) => setCollegeId(e.target.value)}
            />
          </Field>
          <Button type="submit" icon="search" loading={loading}>
            Check
          </Button>
        </form>
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
            <ul className="space-y-2">
              {report.prerequisites.map((p) => (
                <li
                  key={p.name}
                  className={`flex items-start gap-2 rounded-md p-2 ${
                    p.satisfied ? 'bg-success-50' : 'bg-error-50'
                  }`}
                >
                  <span className={p.satisfied ? 'text-success-600' : 'text-error-600'}>
                    <Icon name={p.satisfied ? 'check' : 'warning'} size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-900">{p.name}</div>
                    <div className="text-xs text-ink-500">
                      {p.satisfied
                        ? `Satisfied by ${p.satisfiedByCourseIds.map(courseName).join(', ')}`
                        : 'No course covers this yet — a gap to fill.'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : (
        <EmptyState
          icon="school"
          title="Check prerequisites for a college"
          description="Enter a college id to see which of its nursing prerequisites your courses already cover, and which are still gaps."
        />
      )}
    </div>
  );
}

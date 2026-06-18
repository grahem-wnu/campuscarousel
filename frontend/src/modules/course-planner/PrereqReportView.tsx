import { Icon } from '../../shared/ui';
import type { PrereqReport } from './types';

/**
 * Presentational per-college prerequisite breakdown: the courses a student still needs (gaps) listed
 * first, then the ones already covered. Shared by the single-college checker (PrereqChecker), the
 * expandable coverage-matrix rows, and the College Hub's Prerequisites tab — so all three render the
 * "which courses do I need here" answer identically.
 *
 * `courseName` (optional) resolves a course id to a label for the "satisfied by …" line; omit it
 * (e.g. on the college page, which doesn't load the course list) and covered items just say so.
 */
export function PrereqReportView({
  report,
  courseName,
}: {
  report: PrereqReport;
  courseName?: (id: string) => string;
}) {
  if (report.totalCount === 0) {
    return (
      <p className="text-sm text-ink-500">
        No prerequisites are listed for this program yet. Hit <strong>Refresh</strong> on the college to pull its
        program prerequisites — they’ll show up here.
      </p>
    );
  }
  // Gaps first (the actionable part), then satisfied; stable within each group.
  const ordered = [...report.prerequisites].sort((a, b) => Number(a.satisfied) - Number(b.satisfied));
  return (
    <ul className="space-y-2">
      {ordered.map((p) => (
        <li
          key={p.name}
          className={`flex items-start gap-2 rounded-md p-2 ${p.satisfied ? 'bg-success-50' : 'bg-error-50'}`}
        >
          <span className={p.satisfied ? 'text-success-600' : 'text-error-600'}>
            <Icon name={p.satisfied ? 'check' : 'warning'} size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink-900">{p.name}</div>
            <div className="text-xs text-ink-500">
              {p.satisfied
                ? courseName
                  ? `Satisfied by ${p.satisfiedByCourseIds.map(courseName).join(', ')}`
                  : 'Covered by your courses'
                : 'Not covered yet — a course still to take.'}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

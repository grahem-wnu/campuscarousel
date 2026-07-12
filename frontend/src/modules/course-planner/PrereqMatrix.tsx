import { Fragment, useEffect, useState } from 'react';
import { Badge, Card, EmptyState, Icon, Spinner } from '../../shared/ui';
import { getPrereqMatrix } from './api';
import { PrereqReportView } from './PrereqReportView';
import type { PrereqMatrix as PrereqMatrixData, PrereqReport } from './types';

/**
 * Full courses×target-colleges prerequisite matrix. One row per college Keira is pursuing (any
 * status except removed/rejected), columns are the union of all prerequisites; a cell shows whether
 * a course covers that college's prerequisite. College Hub now provides the college list, so this
 * replaces the old "one college at a time" limitation.
 */
export function PrereqMatrix() {
  const [data, setData] = useState<PrereqMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which college row is expanded to show its full "courses you need" breakdown (one at a time).
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setData(await getPrereqMatrix());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the prerequisite matrix.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>;
  if (!data || data.colleges.length === 0) {
    return (
      <EmptyState
        icon="school"
        title="No colleges to map yet"
        description="Add target colleges in the College Hub (with their program prerequisites). They’ll appear here as a coverage matrix against your courses."
      />
    );
  }

  // Build a quick lookup: collegeId -> set of satisfied prereq names.
  const satisfiedByCollege = new Map<string, Set<string>>(
    data.reports.map((r) => [r.collegeId, new Set(r.prerequisites.filter((p) => p.satisfied).map((p) => p.name))]),
  );
  const requiredByCollege = new Map<string, Set<string>>(
    data.reports.map((r) => [r.collegeId, new Set(r.prerequisites.map((p) => p.name))]),
  );
  // Full per-college report, for the expandable "which courses do I need" row.
  const reportByCollege = new Map<string, PrereqReport>(data.reports.map((r) => [r.collegeId, r]));

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-900">Prerequisite coverage</h3>
        <span className="text-xs text-ink-500">{data.colleges.length} college{data.colleges.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="p-2 font-medium">College</th>
              <th className="p-2 font-medium">Met</th>
              {data.allPrerequisites.map((p) => (
                <th key={p} className="p-2 text-center font-medium" title={p}>
                  <span className="block max-w-[5rem] truncate">{p}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.colleges.map((c) => {
              const sat = satisfiedByCollege.get(c.collegeId) ?? new Set<string>();
              const req = requiredByCollege.get(c.collegeId) ?? new Set<string>();
              const complete = c.totalCount > 0 && c.satisfiedCount === c.totalCount;
              const isOpen = expanded === c.collegeId;
              const report = reportByCollege.get(c.collegeId);
              return (
                <Fragment key={c.collegeId}>
                  <tr className="border-t border-surface-border">
                    <td className="p-2 font-medium text-ink-900">
                      {/* Tap a college to expand its full "courses you still need" breakdown. */}
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : c.collegeId)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-1 text-left hover:text-primary-700"
                      >
                        <Icon name="chevron-right" size={14} className={`shrink-0 text-ink-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        <span>{c.collegeName ?? c.collegeId}</span>
                      </button>
                    </td>
                    <td className="p-2">
                      <Badge tone={c.totalCount === 0 ? 'neutral' : complete ? 'success' : 'warn'}>
                        {c.satisfiedCount}/{c.totalCount}
                      </Badge>
                    </td>
                    {data.allPrerequisites.map((p) => {
                      if (!req.has(p)) return <td key={p} className="p-2 text-center text-ink-300">·</td>;
                      return (
                        <td key={p} className="p-2 text-center">
                          {sat.has(p) ? (
                            <Icon name="check" size={16} className="mx-auto text-success-600" />
                          ) : (
                            <Icon name="warning" size={16} className="mx-auto text-error-500" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen ? (
                    <tr className="bg-surface-sunken">
                      <td colSpan={2 + data.allPrerequisites.length} className="p-0">
                        {/* sticky-left keeps this readable while the wide matrix scrolls horizontally. */}
                        <div className="sticky left-0 max-w-[min(36rem,90vw)] space-y-2 p-3">
                          <p className="text-sm font-medium text-ink-800">
                            {c.totalCount === 0
                              ? 'No prerequisites listed for this college yet — Refresh it in the College Hub.'
                              : c.gaps.length === 0
                                ? 'All prerequisites are covered — nothing left to take. 🎉'
                                : `${c.gaps.length} course${c.gaps.length === 1 ? '' : 's'} still needed`}
                          </p>
                          {report ? <PrereqReportView report={report} /> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">
        <Icon name="check" size={12} className="inline text-success-600" /> covered ·{' '}
        <Icon name="warning" size={12} className="inline text-error-500" /> gap · · not required by that college
      </p>
    </Card>
  );
}

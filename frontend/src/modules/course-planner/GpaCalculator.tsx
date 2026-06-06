import { useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Select } from '../../shared/ui';
import { computeGpa, formatGpa } from './logic';
import type { Course, CourseType } from './types';
import { COURSE_TYPES } from './types';

interface WhatIf {
  id: number;
  name: string;
  grade: string;
  units: string;
  type: CourseType;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <div className="text-3xl font-bold text-primary-700">{value}</div>
      <div className="mt-1 text-sm text-ink-500">{label}</div>
    </Card>
  );
}

/**
 * GPA calculator: actual weighted + unweighted from saved courses, plus a what-if projector that
 * adds hypothetical future courses and recomputes — using the same rules as the server.
 */
export function GpaCalculator({ courses }: { courses: Course[] }) {
  const [rows, setRows] = useState<WhatIf[]>([]);
  const [nextId, setNextId] = useState(1);

  const actual = useMemo(() => computeGpa(courses), [courses]);

  const projected = useMemo(() => {
    const hypothetical: Course[] = rows
      .filter((r) => r.grade.trim())
      .map((r) => ({
        courseId: `whatif-${r.id}`,
        name: r.name || 'Hypothetical',
        type: r.type,
        grade: r.grade.trim(),
        units: r.units.trim() ? Number(r.units) : undefined,
        createdAt: '',
        updatedAt: '',
      }));
    return computeGpa([...courses, ...hypothetical]);
  }, [courses, rows]);

  const hasWhatIf = rows.some((r) => r.grade.trim());

  function addRow(): void {
    setRows((rs) => [...rs, { id: nextId, name: '', grade: '', units: '1', type: 'regular' }]);
    setNextId((n) => n + 1);
  }
  function patch(id: number, p: Partial<WhatIf>): void {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function remove(id: number): void {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Unweighted GPA" value={formatGpa(actual.unweighted)} />
        <StatCard label="Weighted GPA" value={formatGpa(actual.weighted)} />
      </div>
      <p className="text-center text-sm text-ink-500">
        From {actual.gradedCount} graded course{actual.gradedCount === 1 ? '' : 's'} ({actual.gradedUnits} units).
        Planned courses without a grade don&apos;t count yet.
      </p>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">What-if projection</h3>
          <Button size="sm" variant="outline" icon="plus" onClick={addRow}>
            Add course
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">
            Add hypothetical courses and grades to see where your GPA could land.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[8rem] flex-1"
                  placeholder="Course name"
                  value={r.name}
                  onChange={(e) => patch(r.id, { name: e.target.value })}
                />
                <Select
                  className="w-36"
                  value={r.type}
                  onChange={(e) => patch(r.id, { type: e.target.value as CourseType })}
                >
                  {COURSE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Input
                  className="w-20"
                  placeholder="Grade"
                  value={r.grade}
                  onChange={(e) => patch(r.id, { grade: e.target.value })}
                />
                <Input
                  className="w-20"
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="Units"
                  value={r.units}
                  onChange={(e) => patch(r.id, { units: e.target.value })}
                />
                <Button size="sm" variant="ghost" icon="close" aria-label="Remove" onClick={() => remove(r.id)} />
              </div>
            ))}
          </div>
        )}

        {hasWhatIf ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-surface-border pt-3">
            <span className="text-sm text-ink-600">Projected:</span>
            <Badge tone="primary">Unweighted {formatGpa(projected.unweighted)}</Badge>
            <Badge tone="primary">Weighted {formatGpa(projected.weighted)}</Badge>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

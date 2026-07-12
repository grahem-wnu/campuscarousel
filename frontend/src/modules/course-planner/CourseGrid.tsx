import { Badge, Card } from '../../shared/ui';
import { buildGrid, unscheduled } from './logic';
import type { Course, Semester, Year } from './types';

const YEAR_LABEL: Record<Year, string> = {
  freshman: 'Freshman',
  sophomore: 'Sophomore',
  junior: 'Junior',
  senior: 'Senior',
};
const SEMESTER_LABEL: Record<Semester | 'other', string> = {
  fall: 'Fall',
  spring: 'Spring',
  'full-year': 'Full Year',
  summer: 'Summer',
  other: 'Other',
};
const YEAR_ORDER: Year[] = ['freshman', 'sophomore', 'junior', 'senior'];
const SEM_ORDER: (Semester | 'other')[] = ['fall', 'spring', 'full-year', 'summer', 'other'];

function CourseChip({ course, onClick }: { course: Course; onClick?: (c: Course) => void }) {
  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(course) : undefined}
      className="w-full rounded-md border border-surface-border bg-surface-base p-2 text-left transition-colors hover:bg-ink-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink-900">{course.name}</span>
        {course.grade ? <span className="shrink-0 text-xs font-semibold text-ink-600">{course.grade}</span> : null}
      </div>
      {course.type && course.type !== 'regular' ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge tone="info">{course.type}</Badge>
        </div>
      ) : null}
    </button>
  );
}

/** 4-year plan: a column per year, courses grouped by semester. */
export function CourseGrid({ courses, onSelect }: { courses: Course[]; onSelect?: (c: Course) => void }) {
  const grid = buildGrid(courses);
  const loose = unscheduled(courses);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-ink-500">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-error-500" /> Required for your program
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-warn-500" /> Recommended
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300" /> Elective
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {YEAR_ORDER.map((year) => {
          const yearTotal = SEM_ORDER.reduce((n, s) => n + grid[year][s].length, 0);
          return (
            <Card key={year} className="space-y-3">
              <h3 className="text-sm font-semibold text-ink-900">{YEAR_LABEL[year]}</h3>
              {yearTotal === 0 ? (
                <p className="text-xs text-ink-400">No courses yet.</p>
              ) : (
                SEM_ORDER.filter((s) => grid[year][s].length > 0).map((sem) => (
                  <div key={sem} className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
                      {SEMESTER_LABEL[sem]}
                    </div>
                    {grid[year][sem].map((c) => (
                      <CourseChip key={c.courseId} course={c} onClick={onSelect} />
                    ))}
                  </div>
                ))
              )}
            </Card>
          );
        })}
      </div>

      {loose.length > 0 ? (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-900">Unscheduled</h3>
          <p className="text-xs text-ink-500">Assign a year to place these on the grid.</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {loose.map((c) => (
              <CourseChip key={c.courseId} course={c} onClick={onSelect} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

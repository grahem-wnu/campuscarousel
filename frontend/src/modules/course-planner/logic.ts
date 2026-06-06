// Pure, framework-free helpers for the Course Planner UI. Kept out of the React components so they
// can be unit-tested in the node environment. The GPA functions MIRROR the backend's gpa.ts exactly
// so the client-side "what-if" projection matches what GET /courses/gpa would return.

import type { BadgeTone } from '../../shared/ui';
import type { Course, CourseType, GpaResult, Semester, Subject, Year } from './types';
import { SEMESTERS, YEARS } from './types';

/** Standard 4.0-scale points for a letter grade, or null if it isn't a graded letter. */
export function letterToPoints(grade: string | undefined): number | null {
  if (!grade) return null;
  const key = grade.trim().toUpperCase();
  const table: Record<string, number> = {
    'A+': 4.0, A: 4.0, 'A-': 3.7,
    'B+': 3.3, B: 3.0, 'B-': 2.7,
    'C+': 2.3, C: 2.0, 'C-': 1.7,
    'D+': 1.3, D: 1.0, 'D-': 0.7,
    F: 0.0,
  };
  return key in table ? table[key]! : null;
}

/** Rigor bonus added to weighted points. */
export function weightBonus(type: CourseType | undefined): number {
  if (type === 'AP' || type === 'dual-enrollment') return 1.0;
  if (type === 'honors') return 0.5;
  return 0;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const unitsOf = (c: Pick<Course, 'units'>): number =>
  typeof c.units === 'number' && c.units > 0 ? c.units : 1;

/** Compute weighted + unweighted GPA. Used both for display and for the what-if projection. */
export function computeGpa(courses: readonly Course[]): GpaResult {
  let sumWeighted = 0;
  let sumUnweighted = 0;
  let gradedUnits = 0;
  let gradedCount = 0;
  for (const c of courses) {
    const base = letterToPoints(c.grade);
    if (base === null) continue;
    const units = unitsOf(c);
    const weighted = typeof c.gradePoints === 'number' ? c.gradePoints : base + weightBonus(c.type);
    sumUnweighted += base * units;
    sumWeighted += weighted * units;
    gradedUnits += units;
    gradedCount += 1;
  }
  return {
    unweighted: gradedUnits > 0 ? round3(sumUnweighted / gradedUnits) : 0,
    weighted: gradedUnits > 0 ? round3(sumWeighted / gradedUnits) : 0,
    gradedUnits,
    gradedCount,
  };
}

/** Format a GPA number to 2 decimals for display. */
export function formatGpa(n: number): string {
  return n.toFixed(2);
}

export type CourseImportance = 'required' | 'recommended' | 'elective';

/**
 * Importance for color-coding the grid: nursing programs lean on science/math (and health
 * sciences); humanities are recommended; everything else is elective. A UI heuristic, not a
 * data field.
 */
export function courseImportance(subject: Subject | undefined): CourseImportance {
  if (subject === 'science' || subject === 'math' || subject === 'health-sciences') return 'required';
  if (subject === 'english' || subject === 'social-studies' || subject === 'world-language') {
    return 'recommended';
  }
  return 'elective';
}

/** Badge tone for an importance level. */
export function importanceTone(importance: CourseImportance): BadgeTone {
  return importance === 'required' ? 'error' : importance === 'recommended' ? 'warn' : 'neutral';
}

/** Grid columns: each academic year split into semesters that get their own sub-column. */
export const GRID_SEMESTERS: Semester[] = ['fall', 'spring'];

/**
 * Bucket courses into a year × semester grid. `full-year`/`summer` (and any course missing a
 * semester) fall into a per-year "other" bucket so nothing is dropped from the plan.
 */
export interface GridCell {
  year: Year;
  semester: Semester | 'other';
  courses: Course[];
}

export function buildGrid(courses: readonly Course[]): Record<Year, Record<Semester | 'other', Course[]>> {
  const empty = (): Record<Semester | 'other', Course[]> => ({
    fall: [], spring: [], 'full-year': [], summer: [], other: [],
  });
  const grid = {
    freshman: empty(), sophomore: empty(), junior: empty(), senior: empty(),
  } as Record<Year, Record<Semester | 'other', Course[]>>;

  for (const c of courses) {
    if (!c.year || !YEARS.includes(c.year)) continue; // unscheduled — shown elsewhere
    const sem: Semester | 'other' = c.semester && SEMESTERS.includes(c.semester) ? c.semester : 'other';
    grid[c.year][sem].push(c);
  }
  return grid;
}

/** Courses with no year assigned — surfaced separately so they aren't lost from the grid. */
export function unscheduled(courses: readonly Course[]): Course[] {
  return courses.filter((c) => !c.year || !YEARS.includes(c.year));
}

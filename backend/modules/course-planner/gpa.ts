// Pure GPA computation for GET /courses/gpa. Kept separate from the handler so it is trivially
// unit-tested, and so the frontend "what-if" projector can mirror the exact same rules.
//
// Unweighted: standard 4.0 letter scale, ignoring course rigor.
// Weighted:   the course's explicit `gradePoints` if provided, else the unweighted points plus a
//             rigor bonus (honors +0.5; AP / dual-enrollment +1.0). Only courses with a gradeable
//             letter grade are counted; planned/in-progress courses (no grade) are ignored.

import type { Course } from '../../shared/data/index.js';

export interface GpaResult {
  unweighted: number;
  weighted: number;
  /** Total units that counted toward the GPA. */
  gradedUnits: number;
  /** Number of graded courses that counted. */
  gradedCount: number;
}

/** Standard 4.0-scale points for a letter grade, or null if the grade isn't a graded letter. */
export function letterToPoints(grade: string | undefined): number | null {
  if (!grade) return null;
  const key = grade.trim().toUpperCase();
  const table: Record<string, number> = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    'D-': 0.7,
    F: 0.0,
  };
  return key in table ? table[key]! : null;
}

/** Rigor bonus added to weighted points. */
export function weightBonus(type: Course['type']): number {
  if (type === 'AP' || type === 'dual-enrollment') return 1.0;
  if (type === 'honors') return 0.5;
  return 0;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Units a course contributes; defaults to 1 when unspecified or non-positive. */
function unitsOf(course: Course): number {
  return typeof course.units === 'number' && course.units > 0 ? course.units : 1;
}

export function computeGpa(courses: readonly Course[]): GpaResult {
  let sumWeighted = 0;
  let sumUnweighted = 0;
  let gradedUnits = 0;
  let gradedCount = 0;

  for (const course of courses) {
    const base = letterToPoints(course.grade);
    if (base === null) continue; // not a graded course — skip
    const units = unitsOf(course);
    const weighted =
      typeof course.gradePoints === 'number' ? course.gradePoints : base + weightBonus(course.type);
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

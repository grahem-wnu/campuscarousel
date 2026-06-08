// Pure prerequisite-satisfaction check for GET /courses/prerequisites/:collegeId. Cross-references a
// college's required prerequisites (from the foundational data layer's College entity) against the
// courses whose `satisfiesPrereq[]` claims to cover them. No college-hub module dependency — only
// the frozen `College` shape is read.

import type { College, Course } from '../../shared/data/index.js';

export interface PrereqStatus {
  /** The prerequisite name as listed on the college. */
  name: string;
  satisfied: boolean;
  /** Ids of the courses that satisfy this prerequisite (may be more than one). */
  satisfiedByCourseIds: string[];
}

export interface PrereqReport {
  collegeId: string;
  collegeName?: string;
  prerequisites: PrereqStatus[];
  satisfiedCount: number;
  totalCount: number;
  /** Names of prerequisites not satisfied by any course — the gaps to highlight. */
  gaps: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Build the satisfaction report for one college. A prerequisite is satisfied when some course's
 * `satisfiesPrereq` entry targets this `collegeId` and names the prerequisite (case-insensitive).
 */
export function checkPrerequisites(college: College, courses: readonly Course[]): PrereqReport {
  const required = college.prerequisites ?? [];

  const prerequisites: PrereqStatus[] = required.map((name) => {
    const target = norm(name);
    const satisfiedByCourseIds = courses
      .filter((c) =>
        (c.satisfiesPrereq ?? []).some(
          (p) => p.collegeId === college.collegeId && norm(p.prereqName) === target,
        ),
      )
      .map((c) => c.courseId);
    return { name, satisfied: satisfiedByCourseIds.length > 0, satisfiedByCourseIds };
  });

  const satisfiedCount = prerequisites.filter((p) => p.satisfied).length;
  return {
    collegeId: college.collegeId,
    collegeName: college.name,
    prerequisites,
    satisfiedCount,
    totalCount: prerequisites.length,
    gaps: prerequisites.filter((p) => !p.satisfied).map((p) => p.name),
  };
}

/** Colleges excluded from the prerequisite matrix — ones Keira is no longer pursuing. */
const EXCLUDED_FROM_MATRIX: ReadonlySet<NonNullable<College['status']>> = new Set(['removed', 'rejected']);

export interface PrereqMatrixCollege {
  collegeId: string;
  collegeName?: string;
  status?: College['status'];
  satisfiedCount: number;
  totalCount: number;
  gaps: string[];
}

export interface PrereqMatrix {
  /** One summary row per pursued college, most gaps first (the ones needing attention). */
  colleges: PrereqMatrixCollege[];
  /** Full per-college reports (course-level detail) keyed by the same collegeIds. */
  reports: PrereqReport[];
  /** Every distinct prerequisite name across all pursued colleges, for a columns×rows view. */
  allPrerequisites: string[];
}

/**
 * Build the full courses×target-colleges matrix: run {@link checkPrerequisites} for every college
 * Keira is still pursuing (any status except removed/rejected) against her current courses. Sorted
 * with the biggest gaps first so the UI surfaces what still needs a course.
 */
export function buildPrereqMatrix(colleges: readonly College[], courses: readonly Course[]): PrereqMatrix {
  const pursued = colleges.filter((c) => c.status === undefined || !EXCLUDED_FROM_MATRIX.has(c.status));
  const reports = pursued
    .map((c) => ({ report: checkPrerequisites(c, courses), status: c.status }))
    .sort((a, b) => {
      const gapsA = a.report.totalCount - a.report.satisfiedCount;
      const gapsB = b.report.totalCount - b.report.satisfiedCount;
      if (gapsA !== gapsB) return gapsB - gapsA;
      return (a.report.collegeName ?? a.report.collegeId).localeCompare(b.report.collegeName ?? b.report.collegeId);
    });

  const allPrerequisites = [...new Set(reports.flatMap((r) => r.report.prerequisites.map((p) => p.name)))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    colleges: reports.map(({ report, status }) => ({
      collegeId: report.collegeId,
      collegeName: report.collegeName,
      status,
      satisfiedCount: report.satisfiedCount,
      totalCount: report.totalCount,
      gaps: report.gaps,
    })),
    reports: reports.map((r) => r.report),
    allPrerequisites,
  };
}

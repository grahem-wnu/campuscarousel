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

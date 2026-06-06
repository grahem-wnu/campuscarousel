// Compute Keira's real, comparable stats from the source modules (course-planner GPA, teas-prep
// TEAS, clinical-hours, activity-journal volunteer hours, certifications). Pure + unit-tested: the
// handler reads the source collections (visibility-filtered for the caller — see handlers.ts) and
// passes the raw lists here. Nothing in this file touches AWS or the request.

import type { Activity, Certification, Clinical, Course, Teas } from '../../shared/data/index.js';

/** Keira's aggregate, benchmark-comparable stats. Hours default to 0; GPA/TEAS are undefined until
 *  there is data (so the comparison can report "insufficient data" / "not-taken" honestly). */
export interface KeiraStats {
  gpa?: number;
  teasScore?: number;
  clinicalHours: number;
  volunteerHours: number;
  certifications: string[];
}

export interface StatSources {
  courses: readonly Course[];
  teas: readonly Teas[];
  clinical: readonly Clinical[];
  activities: readonly Activity[];
  certifications: readonly Certification[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

/** Weighted GPA: sum(gradePoints × units) / sum(units), treating a missing/zero unit count as 1.
 *  Undefined when no course carries grade points (nothing to average). */
export function computeGpa(courses: readonly Course[]): number | undefined {
  const graded = courses.filter((c) => typeof c.gradePoints === 'number');
  if (graded.length === 0) return undefined;
  let points = 0;
  let units = 0;
  for (const c of graded) {
    const u = typeof c.units === 'number' && c.units > 0 ? c.units : 1;
    points += (c.gradePoints as number) * u;
    units += u;
  }
  return units > 0 ? round2(points / units) : undefined;
}

/** Best (highest) TEAS overall score across all records; undefined if she has never scored one. */
export function bestTeasScore(teas: readonly Teas[]): number | undefined {
  const scores = teas
    .map((t) => t.overallScore)
    .filter((s): s is number => typeof s === 'number');
  return scores.length ? Math.max(...scores) : undefined;
}

/** A certification "counts" once it is earned: an explicit earned/active/renewed status, or a
 *  recorded dateEarned. Planned/in-progress certs don't count toward the competitive comparison. */
export function isEarnedCert(cert: Certification): boolean {
  if (cert.status === 'active' || cert.status === 'renewed') return true;
  if (cert.status === 'planned' || cert.status === 'in-progress') return false;
  return Boolean(cert.dateEarned);
}

export function computeKeiraStats(s: StatSources): KeiraStats {
  const certifications = [
    ...new Set(s.certifications.filter(isEarnedCert).map((c) => c.name.trim()).filter(Boolean)),
  ];
  return {
    gpa: computeGpa(s.courses),
    teasScore: bestTeasScore(s.teas),
    clinicalHours: round2(sum(s.clinical.map((c) => (typeof c.hours === 'number' ? c.hours : 0)))),
    volunteerHours: round2(
      sum(
        s.activities
          .filter((a) => a.category === 'volunteer')
          .map((a) => (typeof a.hours === 'number' ? a.hours : 0)),
      ),
    ),
    certifications,
  };
}

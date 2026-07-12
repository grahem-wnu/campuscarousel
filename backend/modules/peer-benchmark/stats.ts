// Compute Keira's real, comparable stats from the source modules (course-planner GPA, exam-prep
// scores, experience hours, activity-journal volunteer hours, certifications). Pure + unit-tested: the
// handler reads the source collections (visibility-filtered for the caller — see handlers.ts) and
// passes the raw lists here. Nothing in this file touches AWS or the request.

import type { Activity, Certification, ExperienceEntry, Course, ExamScore } from '../../shared/data/index.js';
import { letterToPoints } from '../course-planner/gpa.js';

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
  exams: readonly ExamScore[];
  experiences: readonly ExperienceEntry[];
  activities: readonly Activity[];
  certifications: readonly Certification[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

/** The student's GPA for the benchmark comparison: sum(points × units) / sum(units). A course counts
 *  when it carries a grade signal — an explicit numeric `gradePoints`, OR a letter `grade` mapped to
 *  the standard 4.0 scale via the course planner's `letterToPoints` (shared so the two never drift).
 *  Most courses are entered with just a letter grade (no gradePoints), so reading gradePoints alone
 *  — as this used to — wrongly showed "no GPA". Undefined when nothing is graded yet, so the
 *  comparison reports "no data" honestly instead of inventing a 0. */
export function computeGpa(courses: readonly Course[]): number | undefined {
  let points = 0;
  let units = 0;
  for (const c of courses) {
    const pts = typeof c.gradePoints === 'number' ? c.gradePoints : letterToPoints(c.grade);
    if (pts === null) continue; // not a graded course — skip
    const u = typeof c.units === 'number' && c.units > 0 ? c.units : 1;
    points += pts * u;
    units += u;
  }
  return units > 0 ? round2(points / units) : undefined;
}

/** Best (highest) exam overall score across all records; undefined if she has never scored one. */
export function bestTeasScore(exams: readonly ExamScore[]): number | undefined {
  const scores = exams
    .map((t) => t.overallScore)
    .filter((s): s is number => typeof s === 'number');
  return scores.length ? Math.max(...scores) : undefined;
}

/** A certification "counts" once it is earned and still valid: an active/renewed/expiring-soon
 *  status, or a recorded dateEarned. Planned/in-progress/expired certs don't count toward the
 *  competitive comparison (an expired CNA isn't a current edge, even with a dateEarned). */
export function isEarnedCert(cert: Certification): boolean {
  if (cert.status === 'active' || cert.status === 'renewed' || cert.status === 'expiring-soon') return true;
  if (cert.status === 'planned' || cert.status === 'in-progress' || cert.status === 'expired') return false;
  return Boolean(cert.dateEarned);
}

export function computeKeiraStats(s: StatSources): KeiraStats {
  const certifications = [
    ...new Set(s.certifications.filter(isEarnedCert).map((c) => c.name.trim()).filter(Boolean)),
  ];
  return {
    gpa: computeGpa(s.courses),
    teasScore: bestTeasScore(s.exams),
    clinicalHours: round2(sum(s.experiences.map((c) => (typeof c.hours === 'number' ? c.hours : 0)))),
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

// Gathering the student's real, benchmark-comparable stats from the source modules (course-planner
// GPA, exam-prep scores, experience hours, activity-journal volunteer hours, certifications). Shared
// by the request handlers and the async research worker, so it lives in its own file to avoid a
// handlers ⇄ research import cycle.

import { filterForRequester, type Requester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { computeKeiraStats, type KeiraStats } from './stats.js';

async function sources(data: Data) {
  const [courses, exams, experiences, activities, certifications] = await Promise.all([
    data.courses.list(),
    data.exams.list(),
    data.experiences.list(),
    data.activities.list(),
    data.certifications.list(),
  ]);
  return { courses, exams, experiences, activities, certifications };
}

/** The student's comparable stats, with experience/volunteer hours visibility-filtered for the
 *  caller so a parent never sees private-entry hours folded in. Courses/exams/certs aren't
 *  visibility-bearing. Used for the LIVE comparison computed per-request on read. */
export async function gatherStats(data: Data, requester: Requester): Promise<KeiraStats> {
  const s = await sources(data);
  return computeKeiraStats({
    courses: s.courses,
    exams: s.exams,
    certifications: s.certifications,
    experiences: filterForRequester(s.experiences, requester),
    activities: filterForRequester(s.activities, requester),
  });
}

/** Family-visible stats: private entries ALWAYS excluded, regardless of caller. This is the basis
 *  for anything PERSISTED (the monthly trend, and the stored benchmark comparison), which is
 *  family-visible and must never embed the student's private-entry hours. */
export async function gatherFamilyVisibleStats(data: Data): Promise<KeiraStats> {
  const s = await sources(data);
  return computeKeiraStats({
    courses: s.courses,
    exams: s.exams,
    certifications: s.certifications,
    experiences: s.experiences.filter((e) => e.visibility !== 'private'),
    activities: s.activities.filter((a) => a.visibility !== 'private'),
  });
}

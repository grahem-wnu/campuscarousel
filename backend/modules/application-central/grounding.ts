// PRIVACY-CRITICAL: the essay AI's "find relevant experiences" path is the canonical case where a
// PRIVATE journal/experience/motivation entry IS surfaced — but ONLY when keira (the student) is the
// authenticated caller. A parent/admin gets family-visible experiences only. Filtering uses the
// frozen shared `aiVisibleSet`. AI output is returned live (never persisted), so private-derived
// suggestions can't leak through a later read.

import { aiVisibleSet, type Requester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';

export interface Experience {
  kind: 'activity' | 'experience' | 'motivation';
  date: string;
  title: string;
  detail?: string;
  tags?: string[];
}

export interface ExperiencePool {
  experiences: Experience[];
  includesPrivate: boolean;
  counts: { activities: number; experiences: number; motivations: number };
}

const clip = (s: string | undefined, n = 280): string | undefined =>
  s && s.length > n ? `${s.slice(0, n)}…` : s || undefined;

/** Gather the experience pool the essay AI may draw on, privacy-filtered off the JWT. */
export async function gatherExperiences(data: Data, requester: Requester): Promise<ExperiencePool> {
  const [activities, experienceEntries, motivations] = await Promise.all([
    data.activities.list(),
    data.experiences.list(),
    data.motivations.list(),
  ]);
  const vA = aiVisibleSet(activities, requester);
  const vC = aiVisibleSet(experienceEntries, requester);
  const vW = aiVisibleSet(motivations, requester);

  const experiences: Experience[] = [
    ...vA.map((a) => ({ kind: 'activity' as const, date: a.date, title: a.title, detail: clip(a.reflection ?? a.description), tags: a.tags })),
    ...vC.map((c) => ({ kind: 'experience' as const, date: c.date, title: `${c.facility}${c.department ? ` — ${c.department}` : ''}`, detail: clip(c.reflection ?? (c.duties ?? []).join(', ')) })),
    ...vW.map((w) => ({ kind: 'motivation' as const, date: w.date, title: w.title, detail: clip(w.content), tags: w.tags })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    experiences,
    includesPrivate:
      vA.some((a) => a.visibility === 'private') ||
      vC.some((c) => c.visibility === 'private') ||
      vW.some((w) => w.visibility === 'private'),
    counts: { activities: vA.length, experiences: vC.length, motivations: vW.length },
  };
}

/** Gather a FAMILY-ONLY experience pool (private entries always excluded), regardless of caller.
 *  Used for the recommendation brief, which is shared with a recommender and therefore must never
 *  carry private content — even when keira is the authenticated caller. */
export async function gatherSharedExperiences(data: Data): Promise<ExperiencePool> {
  const [activities, experienceEntries, motivations] = await Promise.all([
    data.activities.list(),
    data.experiences.list(),
    data.motivations.list(),
  ]);
  const vA = activities.filter((a) => a.visibility !== 'private');
  const vC = experienceEntries.filter((c) => c.visibility !== 'private');
  const vW = motivations.filter((w) => w.visibility !== 'private');

  const experiences: Experience[] = [
    ...vA.map((a) => ({ kind: 'activity' as const, date: a.date, title: a.title, detail: clip(a.reflection ?? a.description), tags: a.tags })),
    ...vC.map((c) => ({ kind: 'experience' as const, date: c.date, title: `${c.facility}${c.department ? ` — ${c.department}` : ''}`, detail: clip(c.reflection ?? (c.duties ?? []).join(', ')) })),
    ...vW.map((w) => ({ kind: 'motivation' as const, date: w.date, title: w.title, detail: clip(w.content), tags: w.tags })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    experiences,
    includesPrivate: false,
    counts: { activities: vA.length, experiences: vC.length, motivations: vW.length },
  };
}

/** Compact text rendering of the pool for an AI prompt. */
export function poolToText(pool: ExperiencePool, limit = 30): string {
  if (pool.experiences.length === 0) return '(no logged experiences yet)';
  return pool.experiences
    .slice(0, limit)
    .map((e) => `- [${e.kind} ${e.date}] ${e.title}${e.detail ? `: ${e.detail}` : ''}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Target-college context — "what this school is looking for", assembled from the
// hydrated college record + its benchmark. All fields are family-visible AI-hydrated
// data, so no privacy filtering is needed here.
// ---------------------------------------------------------------------------

export interface CollegeContext {
  collegeId: string;
  name: string;
  overview?: string;
  admissionsDeepDive?: string;
  essayPrompts?: string[];
  competitiveEdges?: string[];
}

/** Load the essay's target-college context. Returns undefined when the essay has no college,
 *  the id doesn't resolve, or the lookup fails — the AI degrades to college-agnostic coaching. */
export async function gatherCollegeContext(data: Data, collegeId?: string): Promise<CollegeContext | undefined> {
  if (!collegeId) return undefined;
  try {
    const college = await data.colleges.get(collegeId);
    if (!college) return undefined;
    const benchmark = await data.benchmarks.get(collegeId).catch(() => undefined);
    return {
      collegeId: college.collegeId,
      name: college.name,
      overview: clip(college.overview, 500),
      admissionsDeepDive: clip(college.admissionsDeepDive, 700),
      essayPrompts: college.essayPrompts?.slice(0, 8),
      competitiveEdges: benchmark?.competitiveEdges?.slice(0, 6),
    };
  } catch {
    return undefined;
  }
}

/** Compact text rendering of the college context for an AI prompt. */
export function collegeToText(college: CollegeContext): string {
  return [
    `Target college: ${college.name}`,
    college.overview ? `About the school: ${college.overview}` : '',
    college.admissionsDeepDive ? `How admissions works there: ${college.admissionsDeepDive}` : '',
    college.essayPrompts?.length ? `Their real essay prompts:\n${college.essayPrompts.map((p) => `  - ${p}`).join('\n')}` : '',
    college.competitiveEdges?.length ? `What makes applicants stand out there: ${college.competitiveEdges.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// PRIVACY-CRITICAL: the essay AI's "find relevant experiences" path is the canonical case where a
// PRIVATE journal/clinical/why-nursing entry IS surfaced — but ONLY when keira (the student) is the
// authenticated caller. A parent/admin gets family-visible experiences only. Filtering uses the
// frozen shared `aiVisibleSet`. AI output is returned live (never persisted), so private-derived
// suggestions can't leak through a later read.

import { aiVisibleSet, type Requester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';

export interface Experience {
  kind: 'activity' | 'clinical' | 'why-nursing';
  date: string;
  title: string;
  detail?: string;
  tags?: string[];
}

export interface ExperiencePool {
  experiences: Experience[];
  includesPrivate: boolean;
  counts: { activities: number; clinical: number; whyNursing: number };
}

const clip = (s: string | undefined, n = 280): string | undefined =>
  s && s.length > n ? `${s.slice(0, n)}…` : s || undefined;

/** Gather the experience pool the essay AI may draw on, privacy-filtered off the JWT. */
export async function gatherExperiences(data: Data, requester: Requester): Promise<ExperiencePool> {
  const [activities, clinical, whyNursing] = await Promise.all([
    data.activities.list(),
    data.clinical.list(),
    data.whyNursing.list(),
  ]);
  const vA = aiVisibleSet(activities, requester);
  const vC = aiVisibleSet(clinical, requester);
  const vW = aiVisibleSet(whyNursing, requester);

  const experiences: Experience[] = [
    ...vA.map((a) => ({ kind: 'activity' as const, date: a.date, title: a.title, detail: clip(a.reflection ?? a.description), tags: a.tags })),
    ...vC.map((c) => ({ kind: 'clinical' as const, date: c.date, title: `${c.facility}${c.department ? ` — ${c.department}` : ''}`, detail: clip(c.reflection ?? (c.duties ?? []).join(', ')) })),
    ...vW.map((w) => ({ kind: 'why-nursing' as const, date: w.date, title: w.title, detail: clip(w.content), tags: w.tags })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    experiences,
    includesPrivate:
      vA.some((a) => a.visibility === 'private') ||
      vC.some((c) => c.visibility === 'private') ||
      vW.some((w) => w.visibility === 'private'),
    counts: { activities: vA.length, clinical: vC.length, whyNursing: vW.length },
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

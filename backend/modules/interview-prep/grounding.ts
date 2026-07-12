// PRIVACY-CRITICAL: gathers the real experiences the AI uses to ground interview feedback, filtered
// off the JWT so a private journal/experience/motivation entry is included ONLY when keira (the
// student) is the authenticated caller. A parent/admin running a mock gets family-visible entries
// only. Filtering uses the frozen shared `aiVisibleSet` — the single source of truth for the rule.

import { aiVisibleSet, type Requester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';

export interface ExperienceRef {
  kind: 'activity' | 'experience' | 'motivation';
  date: string;
  title: string;
  detail?: string;
}

export interface GroundingContext {
  experiences: ExperienceRef[];
  counts: { activities: number; experiences: number; motivations: number };
  /** True when the set includes any `private` entry — i.e. keira is the caller. For tests/telemetry. */
  includesPrivate: boolean;
}

const clip = (s: string | undefined, n = 240): string | undefined =>
  s && s.length > n ? `${s.slice(0, n)}…` : s || undefined;

/**
 * Build the grounding context for `requester`. Reads activities, experience hours, and motivation
 * entries via the shared data layer and runs each through `aiVisibleSet(items, requester)` so private
 * entries are dropped for everyone except the student.
 */
export async function gatherGrounding(data: Data, requester: Requester): Promise<GroundingContext> {
  const [activities, experienceEntries, motivations] = await Promise.all([
    data.activities.list(),
    data.experiences.list(),
    data.motivations.list(),
  ]);

  const vActs = aiVisibleSet(activities, requester);
  const vClin = aiVisibleSet(experienceEntries, requester);
  const vWhy = aiVisibleSet(motivations, requester);

  const experiences: ExperienceRef[] = [
    ...vActs.map((a) => ({
      kind: 'activity' as const,
      date: a.date,
      title: a.title,
      detail: clip(a.reflection ?? a.description),
    })),
    ...vClin.map((c) => ({
      kind: 'experience' as const,
      date: c.date,
      title: `${c.facility}${c.department ? ` — ${c.department}` : ''}`,
      detail: clip(c.reflection ?? (c.duties ?? []).join(', ')),
    })),
    ...vWhy.map((w) => ({
      kind: 'motivation' as const,
      date: w.date,
      title: w.title,
      detail: clip(w.content),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const includesPrivate =
    vActs.some((a) => a.visibility === 'private') ||
    vClin.some((c) => c.visibility === 'private') ||
    vWhy.some((w) => w.visibility === 'private');

  return {
    experiences,
    counts: { activities: vActs.length, experiences: vClin.length, motivations: vWhy.length },
    includesPrivate,
  };
}

/** A compact text rendering of the grounding for an AI prompt. */
export function groundingToText(ctx: GroundingContext, limit = 25): string {
  if (ctx.experiences.length === 0) return '(no logged experiences yet)';
  return ctx.experiences
    .slice(0, limit)
    .map((e) => `- [${e.kind} ${e.date}] ${e.title}${e.detail ? `: ${e.detail}` : ''}`)
    .join('\n');
}

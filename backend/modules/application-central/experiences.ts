// Pure helpers for the essay "find experiences" path: normalise the student's accumulated, visibility
// -bearing source data (journal activities, clinical hours, why-nursing entries) into a single
// candidate shape the AI can reason over. Visibility filtering itself is NOT done here — the handler
// applies `aiVisibleSet` so private entries reach the AI ONLY when Keira is the caller (privacy is
// enforced once, off the JWT). Each candidate carries its `visibility` so the filter can act on the
// unified list. No data-layer/AWS access here, so this unit-tests directly.

import type { Activity, Clinical, WhyNursing } from '../../shared/data/index.js';
import type { Visibility } from '../../shared/auth/index.js';

export type ExperienceSource = 'activity' | 'clinical' | 'why-nursing';

/** A normalised, AI-ready experience candidate. `visibility` drives the aiVisibleSet filter. */
export interface ExperienceCandidate {
  source: ExperienceSource;
  id: string;
  date?: string;
  title: string;
  text: string;
  visibility: Visibility;
}

const clip = (s: string | undefined, n: number): string => (s ?? '').slice(0, n);

/** Normalise journal/clinical/why-nursing records into one candidate list (unfiltered). */
export function toExperienceCandidates(
  activities: readonly Activity[],
  clinical: readonly Clinical[],
  whyNursing: readonly WhyNursing[],
): ExperienceCandidate[] {
  const out: ExperienceCandidate[] = [];
  for (const a of activities) {
    out.push({
      source: 'activity',
      id: a.activityId,
      date: a.date,
      title: clip(a.title, 200),
      text: clip([a.description, a.reflection].filter(Boolean).join(' — '), 2000),
      visibility: a.visibility ?? 'family',
    });
  }
  for (const c of clinical) {
    out.push({
      source: 'clinical',
      id: c.entryId,
      date: c.date,
      title: clip([c.facility, c.department].filter(Boolean).join(' · ') || 'Clinical hours', 200),
      text: clip([(c.duties ?? []).join(', '), c.reflection].filter(Boolean).join(' — '), 2000),
      visibility: c.visibility ?? 'family',
    });
  }
  for (const w of whyNursing) {
    out.push({
      source: 'why-nursing',
      id: w.entryId,
      date: w.date,
      title: clip(w.title, 200),
      text: clip(w.content, 2000),
      visibility: w.visibility ?? 'family',
    });
  }
  return out;
}

/** A stable key for a candidate (source+id), used to reference selections back to the source. */
export const candidateKey = (c: Pick<ExperienceCandidate, 'source' | 'id'>): string => `${c.source}:${c.id}`;

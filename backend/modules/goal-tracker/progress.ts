// Pure progress + milestone helpers. No data-layer or AWS access — just the small bits of logic
// the handlers reuse, kept here so they can be unit-tested in isolation.

import type { Goal } from '../../shared/data/index.js';

export type Milestone = NonNullable<Goal['milestones']>[number];

/** Milestone shape as it arrives from the request schema: id + completion are optional. */
export interface MilestoneInput {
  id?: string;
  label: string;
  completed?: boolean;
  completedDate?: string;
}

/** Clamp an arbitrary number to an integer in [0, 100]. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Auto-progress from milestone completion: the share of milestones marked done, 0-100. Returns
 *  null when there are no milestones (so the caller can fall back to the manually-set value). */
export function progressFromMilestones(milestones: Milestone[] | undefined): number | null {
  if (!milestones || milestones.length === 0) return null;
  const done = milestones.filter((m) => m.completed).length;
  return clampProgress((done / milestones.length) * 100);
}

/**
 * Normalise the milestones a client sent: ensure every milestone has a stable id (generating one
 * when missing) and stamp `completedDate` the moment a milestone first reads as completed without
 * one. `today` is injected so the stamp is deterministic in tests.
 */
export function normaliseMilestones(
  milestones: MilestoneInput[] | undefined,
  genId: () => string,
  today: string,
): Milestone[] | undefined {
  if (!milestones) return undefined;
  return milestones.map((m) => {
    const id = m.id && m.id.length > 0 ? m.id : genId();
    const completed = m.completed ?? false;
    const completedDate = completed ? (m.completedDate ?? today) : undefined;
    const next: Milestone = { id, label: m.label, completed };
    if (completedDate) next.completedDate = completedDate;
    return next;
  });
}

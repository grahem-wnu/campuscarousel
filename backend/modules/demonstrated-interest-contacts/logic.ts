// Pure helpers for the module: group potential recommenders into the four slots, flag coverage
// gaps, and filter pending follow-ups. No AWS, no request — unit-tested in logic.test.ts.

import type { Contact, Touchpoint } from '../../shared/data/index.js';
import { RECOMMENDER_SLOTS } from './schema.js';

export type RecommenderSlot = (typeof RECOMMENDER_SLOTS)[number];

export interface RecommenderGroup {
  slot: RecommenderSlot | 'unassigned';
  contacts: Contact[];
}

/**
 * Group potential recommenders by their assigned slot. Returns a group for each of the four canonical
 * slots (in order) plus a trailing "unassigned" group for potential recommenders without a slot.
 * Non-recommender contacts are ignored.
 */
export function groupRecommenders(contacts: readonly Contact[]): RecommenderGroup[] {
  const pool = contacts.filter((c) => c.isPotentialRecommender);
  const groups: RecommenderGroup[] = RECOMMENDER_SLOTS.map((slot) => ({
    slot,
    contacts: pool.filter((c) => c.recommenderSlot === slot),
  }));
  const assigned = new Set<string>(RECOMMENDER_SLOTS);
  const unassigned = pool.filter((c) => !c.recommenderSlot || !assigned.has(c.recommenderSlot));
  groups.push({ slot: 'unassigned', contacts: unassigned });
  return groups;
}

/** The canonical slots that have no assigned recommender yet — the "you have none in X" insight. */
export function coverageGaps(contacts: readonly Contact[]): RecommenderSlot[] {
  const filled = new Set(
    contacts.filter((c) => c.isPotentialRecommender && c.recommenderSlot).map((c) => c.recommenderSlot),
  );
  return RECOMMENDER_SLOTS.filter((slot) => !filled.has(slot));
}

/** A touchpoint is a pending follow-up when one is needed and not yet completed. */
export function isPendingFollowUp(t: Touchpoint): boolean {
  return Boolean(t.followUpNeeded) && !t.followUpCompleted;
}

/** Sort pending follow-ups by due date (those with a date first, soonest first; undated last). */
export function sortFollowUps<T extends { followUpDate?: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.followUpDate && b.followUpDate) return a.followUpDate < b.followUpDate ? -1 : a.followUpDate > b.followUpDate ? 1 : 0;
    if (a.followUpDate) return -1;
    if (b.followUpDate) return 1;
    return 0;
  });
}

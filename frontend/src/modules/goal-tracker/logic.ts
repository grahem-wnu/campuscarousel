// Pure presentation logic for the Goal Tracker — category/status metadata, milestone-derived
// progress, and the board/timeline groupings. No React, no network, so it is unit-tested directly.

import type { BadgeTone } from '../../shared/ui';
import type { IconName } from '../../shared/ui';
import type { Category, Goal, Milestone, Status } from './types';
import { CATEGORIES } from './types';

export const CATEGORY_META: Record<Category, { label: string; icon: IconName }> = {
  academic: { label: 'Academic', icon: 'course' },
  clinical: { label: 'Clinical', icon: 'clinical' },
  extracurricular: { label: 'Extracurricular', icon: 'star' },
  'test-prep': { label: 'Test Prep', icon: 'teas' },
  application: { label: 'Application', icon: 'application' },
  personal: { label: 'Personal', icon: 'heart' },
};

export const STATUS_META: Record<Status, { label: string; tone: BadgeTone }> = {
  'not-started': { label: 'Not Started', tone: 'neutral' },
  'in-progress': { label: 'In Progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  deferred: { label: 'Deferred', tone: 'warn' },
  dropped: { label: 'Dropped', tone: 'error' },
};

/** The three columns of the kanban board, in order. `deferred`/`dropped` are filed off-board. */
export const BOARD_COLUMNS: { status: Status; label: string }[] = [
  { status: 'not-started', label: 'Not Started' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
];

export const categoryLabel = (c?: Category): string => (c ? CATEGORY_META[c].label : 'Uncategorized');

/** Share of milestones completed, 0-100, or null when a goal has no milestones. */
export function milestoneProgress(milestones: Milestone[] | undefined): number | null {
  if (!milestones || milestones.length === 0) return null;
  const done = milestones.filter((m) => m.completed).length;
  return Math.round((done / milestones.length) * 100);
}

/**
 * The progress to show on the bar: milestone-derived when a goal has milestones ("auto"), otherwise
 * the manually-set value. Mirrors the spec's "manual or auto from linked activities" — milestones
 * are the completable units, so they drive auto-progress.
 */
export function displayProgress(goal: Pick<Goal, 'milestones' | 'progress'>): number {
  return milestoneProgress(goal.milestones) ?? goal.progress ?? 0;
}

/** True when the bar reflects milestone completion rather than a manual value. */
export function isAutoProgress(goal: Pick<Goal, 'milestones'>): boolean {
  return (goal.milestones?.length ?? 0) > 0;
}

/** Bucket goals into the three board columns by status (deferred/dropped land nowhere on-board). */
export function groupByStatus(goals: Goal[]): Record<Status, Goal[]> {
  const out = {
    'not-started': [] as Goal[],
    'in-progress': [] as Goal[],
    completed: [] as Goal[],
    deferred: [] as Goal[],
    dropped: [] as Goal[],
  } satisfies Record<Status, Goal[]>;
  for (const g of goals) out[g.status ?? 'not-started'].push(g);
  return out;
}

/**
 * Group goals by period (school year) for the timeline view, sorted by period label with goals
 * lacking a period collected under "Unscheduled" last.
 */
export function groupByPeriod(goals: Goal[]): { period: string; goals: Goal[] }[] {
  const UNSCHEDULED = 'Unscheduled';
  const map = new Map<string, Goal[]>();
  for (const g of goals) {
    const key = g.period?.trim() || UNSCHEDULED;
    (map.get(key) ?? map.set(key, []).get(key)!).push(g);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === UNSCHEDULED) return 1;
      if (b === UNSCHEDULED) return -1;
      return a.localeCompare(b);
    })
    .map(([period, gs]) => ({ period, goals: gs }));
}

/** Filter goals by a free-text search over title/description (case-insensitive). */
export function filterBySearch(goals: Goal[], search: string): Goal[] {
  const q = search.trim().toLowerCase();
  if (!q) return goals;
  return goals.filter(
    (g) => g.title.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q),
  );
}

export const ALL_CATEGORIES = CATEGORIES;

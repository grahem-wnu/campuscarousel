// Pure, framework-free helpers for the Activity Journal UI. Kept out of the React components so
// they can be unit-tested in the node environment (the repo has no jsdom; component rendering is
// not unit-tested, the logic is).

import type { BadgeTone } from '../../shared/ui';
import type { IconName } from '../../shared/ui';
import type { Activity, Category, Visibility } from './types';

export interface CategoryMeta {
  label: string;
  icon: IconName;
  tone: BadgeTone;
}

/** Display metadata per category — labels, an icon from the shared set, and a badge tone. */
export const CATEGORY_META: Record<Category, CategoryMeta> = {
  volunteer: { label: 'Volunteer', icon: 'heart', tone: 'primary' },
  clinical: { label: 'Clinical', icon: 'clinical', tone: 'info' },
  academic: { label: 'Academic', icon: 'course', tone: 'success' },
  athletic: { label: 'Athletic', icon: 'goal', tone: 'warn' },
  leadership: { label: 'Leadership', icon: 'star', tone: 'primary' },
  personal: { label: 'Personal', icon: 'user', tone: 'neutral' },
  work: { label: 'Work', icon: 'application', tone: 'neutral' },
  award: { label: 'Award', icon: 'certificate', tone: 'success' },
  other: { label: 'Other', icon: 'info', tone: 'neutral' },
};

/** Tag attached to reflection entries (the data-layer Activity has no `isReflection` flag; a
 *  reflection is modeled as a `personal` entry carrying this tag — see the module PR notes). */
export const REFLECTION_TAG = 'reflection';

/** Rotating weekly reflection prompts (the journal's raw material for essays later). */
export const REFLECTION_PROMPTS: readonly string[] = [
  'What did you do this week that felt meaningful — and why?',
  'Describe a moment with a patient, peer, or mentor that stuck with you.',
  'What did you learn about yourself this week?',
  'When did you feel most like the person you want to become?',
  'What was hard this week, and how did you handle it?',
  'Who did you help this week, and what did it teach you?',
  'What are you proud of right now?',
];

/** Whole-week index since the Unix epoch for an ISO date — stable, timezone-free. */
export function weekIndexOf(isoDate: string): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.floor(ms / 86_400_000 / 7);
}

/** The reflection prompt for the week containing `isoDate` (rotates deterministically). */
export function reflectionPromptFor(isoDate: string): string {
  const len = REFLECTION_PROMPTS.length;
  const idx = ((weekIndexOf(isoDate) % len) + len) % len;
  return REFLECTION_PROMPTS[idx] ?? REFLECTION_PROMPTS[0]!;
}

/** Only the student (Keira) may mark an entry private — mirrors the server rule for the UI. */
export function canSetPrivate(role: string | undefined): boolean {
  return role === 'student';
}

/** Newest first, breaking ties by creation time. Returns a new array. */
export function sortByDateDesc(items: readonly Activity[]): Activity[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Group activities by their ISO date (for the calendar). */
export function groupByDate(items: readonly Activity[]): Record<string, Activity[]> {
  const out: Record<string, Activity[]> = {};
  for (const a of items) {
    (out[a.date] ??= []).push(a);
  }
  return out;
}

/** Free-text client-side filter over title/description/subcategory/tags. */
export function filterBySearch(items: readonly Activity[], query: string): Activity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((a) => {
    const hay = [a.title, a.description ?? '', a.subcategory ?? '', ...(a.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

export interface DayCell {
  iso: string;
  inMonth: boolean;
}

/**
 * A 6-week (42-cell), Sunday-start calendar grid for the given month (`month` is 0-based).
 * Cells outside the target month are flagged `inMonth: false`. UTC-based for determinism.
 */
export function buildMonthGrid(year: number, month: number): DayCell[] {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const gridStartMs = Date.UTC(year, month, 1 - firstDow);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStartMs + i * 86_400_000);
    cells.push({ iso: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month });
  }
  return cells;
}

/** Sort a `Record<category, number>` into descending rows for charts/lists. */
export function toSortedRows(byKey: Record<string, number>): { key: string; value: number }[] {
  return Object.entries(byKey)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human label for a `YYYY-MM` month key, e.g. "2026-02" → "Feb 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  if (!y || !m || Number.isNaN(idx) || idx < 0 || idx > 11) return key;
  return `${MONTHS[idx]} ${y}`;
}

/** Pretty label for a visibility value. */
export function visibilityLabel(v: Visibility): string {
  return v === 'private' ? 'Private' : 'Family';
}

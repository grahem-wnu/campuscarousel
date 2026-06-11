// Pure, framework-free helpers for the Motivation UI. Kept out of the React components so they
// can be unit-tested in the node environment (the repo has no jsdom; component rendering is not
// unit-tested, the logic is).

import type { BadgeTone, IconName } from '../../shared/ui';
import type { Category, LinkOption, MotivationEntry } from './types';

export interface CategoryMeta {
  label: string;
  icon: IconName;
  tone: BadgeTone;
}

/** Display metadata per category — labels, an icon from the shared set, and a badge tone. Each
 *  category gets a distinct icon + color so the timeline shows the evolution of her "why". */
export const CATEGORY_META: Record<Category, CategoryMeta> = {
  moment: { label: 'Moment', icon: 'heart', tone: 'primary' },
  realization: { label: 'Realization', icon: 'info', tone: 'info' },
  conversation: { label: 'Conversation', icon: 'chat', tone: 'success' },
  observation: { label: 'Observation', icon: 'search', tone: 'neutral' },
  experience: { label: 'Experience', icon: 'clinical', tone: 'warn' },
  inspiration: { label: 'Inspiration', icon: 'star', tone: 'primary' },
};

/** Fallback metadata for an entry saved without a category. */
export const DEFAULT_META: CategoryMeta = { label: 'Entry', icon: 'book', tone: 'neutral' };

/** Display metadata for an entry's (optional) category, falling back to a neutral default. */
export function metaFor(category?: Category): CategoryMeta {
  return category ? CATEGORY_META[category] : DEFAULT_META;
}

/** Only the student (Keira) may mark an entry private — mirrors the server rule for the UI. */
export function canSetPrivate(role: string | undefined): boolean {
  return role === 'student';
}

/** Newest first, breaking ties by creation time. Returns a new array. */
export function sortByDateDesc(items: readonly MotivationEntry[]): MotivationEntry[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Free-text client-side filter over title / content / tags. */
export function filterBySearch(items: readonly MotivationEntry[], query: string): MotivationEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((e) => {
    const hay = [e.title, e.content, ...(e.tags ?? [])].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

/** Pretty label for a visibility value. */
export function visibilityLabel(v: MotivationEntry['visibility']): string {
  return v === 'private' ? 'Private' : 'Family';
}

/** A short single-line preview of the (possibly long) content for collapsed cards. */
export function previewOf(content: string, max = 240): string {
  const trimmed = content.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

/** Newest-first by date, for link-picker option lists. */
function byDateDesc<T extends { date: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/** Build journal-entry link options from the `/activities` list response (id + a date·title label). */
export function activityLinkOptions(
  activities: readonly { activityId: string; title: string; date: string }[],
): LinkOption[] {
  return byDateDesc(activities).map((a) => ({ id: a.activityId, label: `${a.date} · ${a.title}` }));
}

/** Build clinical-entry link options from the `/clinical` list response (id + a date·facility label). */
export function clinicalLinkOptions(
  entries: readonly { entryId: string; facility: string; date: string }[],
): LinkOption[] {
  return byDateDesc(entries).map((e) => ({ id: e.entryId, label: `${e.date} · ${e.facility}` }));
}

/** Ensure the currently-linked id is always selectable, even if it isn't in the fetched options
 *  (e.g. the list call failed, or the linked entry falls outside the returned set). */
export function withCurrentLink(options: readonly LinkOption[], currentId: string | undefined): LinkOption[] {
  if (!currentId || options.some((o) => o.id === currentId)) return [...options];
  return [{ id: currentId, label: `Linked entry (${currentId})` }, ...options];
}

// Pure, framework-free helpers for the Demonstrated Interest + Contact Network UI. Unit-tested in
// logic.test.ts (the repo has no jsdom; the logic is what's tested).

import type { IconName } from '../../shared/ui';
import type { Contact, ContactFilters, RecommenderSlot, TouchpointType } from './types';

export interface TypeMeta {
  label: string;
  icon: IconName;
}

/** Display metadata per touchpoint type — label + an icon from the shared set. */
export const TOUCHPOINT_META: Record<TouchpointType, TypeMeta> = {
  'info-session': { label: 'Info session', icon: 'school' },
  'campus-visit': { label: 'Campus visit', icon: 'school' },
  'email-exchange': { label: 'Email', icon: 'chat' },
  'phone-call': { label: 'Phone call', icon: 'contacts' },
  webinar: { label: 'Webinar', icon: 'calendar' },
  'college-fair': { label: 'College fair', icon: 'school' },
  interview: { label: 'Interview', icon: 'interview' },
  'social-media': { label: 'Social media', icon: 'chat' },
  other: { label: 'Other', icon: 'info' },
};

/** Human labels for the four recommender slots (+ unassigned). */
export const SLOT_LABELS: Record<RecommenderSlot | 'unassigned', string> = {
  'stem-teacher': 'STEM teacher',
  'humanities-teacher': 'Humanities teacher',
  'clinical-supervisor': 'Clinical / volunteer supervisor',
  'community-leader': 'Community leader',
  unassigned: 'Unassigned',
};

export function slotLabel(slot: RecommenderSlot | 'unassigned'): string {
  return SLOT_LABELS[slot] ?? slot;
}

export function touchpointLabel(type: TouchpointType): string {
  return TOUCHPOINT_META[type]?.label ?? type;
}

/** Newest-first by date (tie broken by createdAt). Returns a new array. */
export function sortByDateDesc<T extends { date: string; createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Filter the rolodex by free text (name/role/org/notes), relationship, and linked college. */
export function filterContacts(contacts: readonly Contact[], f: ContactFilters): Contact[] {
  const needle = (f.q ?? '').trim().toLowerCase();
  return contacts.filter((c) => {
    if (f.relationship && c.relationship !== f.relationship) return false;
    if (f.collegeId && c.linkedCollegeId !== f.collegeId) return false;
    if (!needle) return true;
    const hay = [c.name, c.role ?? '', c.organization ?? '', c.notes ?? ''].join(' ').toLowerCase();
    return hay.includes(needle);
  });
}

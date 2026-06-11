// Pure derivation of the supervisor directory for GET /experience/supervisors. The directory is built
// from the experience entries themselves (no separate entity) so it always reflects logged hours.
// Callers MUST pass an already visibility-filtered list — this does no filtering of its own.

import type { ExperienceEntry } from '../../shared/data/index.js';

export interface SupervisorEntry {
  /** Supervisor display name (the grouping key). */
  name: string;
  /** Most recent non-empty title seen for this supervisor. */
  title?: string;
  /** Most recent non-empty contact (email/phone) seen for this supervisor. */
  contact?: string;
  /** Distinct facilities this supervisor was logged at, in first-seen order. */
  facilities: string[];
  /** Total experience hours supervised. */
  totalHours: number;
  /** Number of entries naming this supervisor. */
  entryCount: number;
  /** Most recent entry date (ISO). */
  lastDate?: string;
}

/**
 * Group visibility-filtered experience entries by `supervisorName`. Entries without a supervisor name
 * are ignored (they can't appear in a directory). Sorted by total hours desc, then name.
 */
export function buildDirectory(entries: readonly ExperienceEntry[]): SupervisorEntry[] {
  const byName = new Map<string, SupervisorEntry>();

  for (const c of entries) {
    const name = c.supervisorName?.trim();
    if (!name) continue;

    let entry = byName.get(name);
    if (!entry) {
      entry = { name, facilities: [], totalHours: 0, entryCount: 0 };
      byName.set(name, entry);
    }

    entry.entryCount += 1;
    entry.totalHours += typeof c.hours === 'number' ? c.hours : 0;
    if (c.supervisorTitle) entry.title = c.supervisorTitle;
    if (c.supervisorContact) entry.contact = c.supervisorContact;
    if (c.facility && !entry.facilities.includes(c.facility)) entry.facilities.push(c.facility);
    if (c.date && (!entry.lastDate || c.date > entry.lastDate)) entry.lastDate = c.date;
  }

  return [...byName.values()].sort((a, b) => {
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

// Duplicate-college guard. A college is identified for dedupe by its normalized name (trim, lower,
// collapse whitespace). Soft-deleted (`removed`) colleges don't count as "already tracked" — a name
// can be re-added after it was removed. Used by create (409 on a clash) and bulk-add (skip clashes).

import type { College } from '../../shared/data/index.js';

export function normalizeCollegeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The active (non-removed) college matching `name`, or undefined. */
export function findActiveByName(colleges: readonly College[], name: string): College | undefined {
  const target = normalizeCollegeName(name);
  return colleges.find((c) => c.status !== 'removed' && normalizeCollegeName(c.name) === target);
}

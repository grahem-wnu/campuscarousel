// Pure list logic for College Hub: filter, search, and sort. Framework- and AWS-free so it unit
// tests for real. The data layer returns the whole collection; these helpers shape it per the
// request query (the collection is small — one family's target list — so in-memory is fine).

import type { College } from '../../shared/data/index.js';
import type { ListQuery } from './schema.js';

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/** Whether a college matches the free-text search across name/location/state/notes/ranking. */
function matchesSearch(c: College, search: string): boolean {
  const needle = norm(search);
  if (!needle) return true;
  const hay = [c.name, c.location, c.state, c.specialNotes, c.ranking]
    .map((v) => norm(v))
    .join(' ');
  return hay.includes(needle);
}

/** Apply the query's filters. `removed` colleges (soft-deleted) are hidden unless includeRemoved. */
export function filterColleges(items: readonly College[], q: ListQuery): College[] {
  const includeRemoved = q.includeRemoved === 'true';
  return items.filter((c) => {
    if (!includeRemoved && c.status === 'removed') return false;
    if (q.status && c.status !== q.status) return false;
    if (q.programType && c.programType !== q.programType) return false;
    if (q.state && norm(c.state) !== norm(q.state)) return false;
    if (q.isTopPick === 'true' && !c.isTopPick) return false;
    if (q.isTopPick === 'false' && c.isTopPick) return false;
    if (!matchesSearch(c, q.search ?? '')) return false;
    return true;
  });
}

/** Best available tuition figure for sorting (out-of-state, then in-state, then total). */
function tuitionOf(c: College): number {
  return c.tuitionOutOfState ?? c.tuitionInState ?? c.estimatedTotalCost ?? Number.POSITIVE_INFINITY;
}

const STATUS_ORDER: Record<string, number> = {
  enrolled: 0,
  accepted: 1,
  applied: 2,
  applying: 3,
  target: 4,
  considering: 5,
  researching: 6,
  rejected: 7,
  removed: 8,
};

/** Sort a copy by the requested key + order. Top picks always sort ABOVE non-picks (the chosen sort
 *  is the tie-breaker within each group), so a student's committed shortlist stays at the top of the
 *  list regardless of the active sort. Default within a group: name ascending. */
export function sortColleges(items: readonly College[], q: ListQuery): College[] {
  const dir = q.sortOrder === 'desc' ? -1 : 1;
  const by = q.sortBy ?? 'name';
  const cmp = (a: College, b: College): number => {
    // Top picks first, regardless of the chosen sort.
    if (Boolean(a.isTopPick) !== Boolean(b.isTopPick)) return a.isTopPick ? -1 : 1;
    switch (by) {
      case 'fitScore':
        return ((a.fitScore ?? -1) - (b.fitScore ?? -1)) * dir;
      case 'tuition':
        return (tuitionOf(a) - tuitionOf(b)) * dir;
      case 'status':
        return ((STATUS_ORDER[a.status ?? 'researching'] ?? 9) - (STATUS_ORDER[b.status ?? 'researching'] ?? 9)) * dir;
      case 'createdAt':
        return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir;
      case 'name':
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  };
  return [...items].sort(cmp);
}

/** Filter then sort — the full GET /colleges pipeline. */
export function queryColleges(items: readonly College[], q: ListQuery): College[] {
  return sortColleges(filterColleges(items, q), q);
}

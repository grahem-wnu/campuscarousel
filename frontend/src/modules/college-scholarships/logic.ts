// Pure helpers for the Scholarships tab — labels, grouping for the dropdown, and the small
// derivations the components would otherwise inline. Kept side-effect free so they're unit-testable
// without rendering anything.

import type { BadgeTone } from '../../shared/ui';
import type {
  CollegeScholarship,
  Competitiveness,
  ScholarshipCategory,
  ScholarshipSearchState,
  SearchCategory,
} from './types';

export const CATEGORY_LABEL: Record<ScholarshipCategory, string> = {
  academic: 'Academic',
  athletic: 'Athletic',
  other: 'Other',
};

export const SEARCH_CATEGORY_LABEL: Record<SearchCategory, string> = {
  all: 'All',
  academic: 'Academic',
  athletic: 'Athletic',
};

/** Dropdown group order — academic first because it's the larger, more common bucket. */
export const CATEGORY_ORDER: ScholarshipCategory[] = ['academic', 'athletic', 'other'];

export const COMPETITIVENESS_LABEL: Record<Competitiveness, string> = {
  'very-high': 'Very competitive',
  high: 'Competitive',
  moderate: 'Moderately competitive',
  accessible: 'Attainable',
  unknown: 'Selectivity unclear',
};

/** Badge color for the odds read. "Attainable" is the encouraging one, so it gets success. */
export const COMPETITIVENESS_TONE: Record<Competitiveness, BadgeTone> = {
  'very-high': 'error',
  high: 'warn',
  moderate: 'info',
  accessible: 'success',
  unknown: 'neutral',
};

/** Group awards for the `<select>`'s optgroups, dropping groups with nothing in them. Within a
 *  group, awards are sorted by name so the list is stable across reloads. */
export function groupByCategory(
  scholarships: readonly CollegeScholarship[],
): { category: ScholarshipCategory; label: string; items: CollegeScholarship[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    items: scholarships
      .filter((s) => (s.category ?? 'other') === category)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}

/** What to show for an award's money: the exact figure when we have one, else the prose the source
 *  used ("Full tuition", "$2,000-$8,000"), else nothing. */
export function amountLabel(s: Pick<CollegeScholarship, 'amount' | 'amountDescription'>): string | null {
  if (typeof s.amount === 'number' && Number.isFinite(s.amount) && s.amount > 0) {
    return `$${s.amount.toLocaleString('en-US')}`;
  }
  return s.amountDescription?.trim() || null;
}

/** The one-line summary under the dropdown: amount · deadline · renewable. */
export function scholarshipMeta(s: CollegeScholarship): string[] {
  const out: string[] = [];
  const amount = amountLabel(s);
  if (amount) out.push(amount);
  if (s.deadline) out.push(`Due ${s.deadline}`);
  if (s.renewable === true) out.push('Renewable');
  if (s.sport) out.push(s.sport);
  return out;
}

/** True while a search is running (or queued) — drives the spinner and disables the controls. */
export function searchBusy(state: ScholarshipSearchState | null | undefined): boolean {
  return state?.status === 'pending' || state?.status === 'in-progress';
}

/** True while this award's dossier is being built. */
export function researchBusy(s: CollegeScholarship | null | undefined): boolean {
  return s?.researchStatus === 'pending' || s?.researchStatus === 'in-progress';
}

/** Has this award been researched into something worth rendering? */
export function hasResearch(s: CollegeScholarship | null | undefined): boolean {
  return Boolean(s?.research && Object.keys(s.research).length > 0);
}

/** "Last searched 20 Aug 2026" — a short, unambiguous date. Invalid input degrades to the raw
 *  string rather than showing "Invalid Date". */
export function lastRunLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Headline for the empty/zero-results state, which differs from "we never searched". When the run
 *  had a query, echo it back — "nothing for 'soccer'" is a very different message from "this school
 *  publishes nothing", and only one of them means try a different word. */
export function emptyMessage(state: ScholarshipSearchState | null | undefined, category: SearchCategory): string {
  if (!state || !state.lastRunAt) return 'No search has been run for this school yet.';
  if (state.query) return `Nothing came back for “${state.query}” at this school.`;
  const scope = category === 'all' ? '' : ` ${SEARCH_CATEGORY_LABEL[category].toLowerCase()}`;
  return `The last search didn’t turn up any${scope} scholarships published for this school.`;
}

/** What the last run was looking for, for the "showing results for…" line. Null before any run. */
export function searchScopeLabel(state: ScholarshipSearchState | null | undefined): string | null {
  if (!state?.lastRunAt) return null;
  if (state.query) return `“${state.query}”`;
  const c = state.category ?? 'all';
  return c === 'all' ? 'all scholarships' : `${SEARCH_CATEGORY_LABEL[c].toLowerCase()} scholarships`;
}

/** Awards currently being researched, for the "3 of 5 done" progress line. */
export function researchProgress(
  scholarships: readonly CollegeScholarship[],
  ids: readonly string[],
): { done: number; failed: number; pending: number; total: number } {
  const set = new Set(ids);
  const picked = scholarships.filter((s) => set.has(s.scholarshipId));
  const done = picked.filter((s) => s.researchStatus === 'complete').length;
  const failed = picked.filter((s) => s.researchStatus === 'failed').length;
  return { done, failed, pending: picked.length - done - failed, total: picked.length };
}

/** Label for the research button — states plainly how many awards a click will research, because
 *  each one is its own couple of minutes and its own AI spend. */
export function researchButtonLabel(selectedCount: number): string {
  if (selectedCount === 0) return 'Research';
  if (selectedCount === 1) return 'Research 1 scholarship';
  return `Research ${selectedCount} scholarships`;
}

/** How many awards may be researched in one click (mirrors the API cap). */
export const MAX_RESEARCH_BATCH = 10;

// Request validation for the College Scholarship Research endpoints (specs/modules/
// college-scholarships.md). Every handler validates with one of these before touching data; a
// failure returns the standard 422 envelope.
//
// These awards are family-visible — no `visibility` field, no private-entry rule (same as
// Scholarship Tracker).

import { z } from '../../shared/api/index.js';

/** What a stored award is. `all` (search-only) is added by `SEARCH_CATEGORIES` below. */
export const CATEGORIES = ['academic', 'athletic', 'other'] as const;

/** What a search can ask for — the stored categories plus the "both" filter. */
export const SEARCH_CATEGORIES = ['academic', 'athletic', 'all'] as const;

/** Params for every route under a college. */
export const collegeParamSchema = z.object({ id: z.string().min(1) });

/** Params for the per-award routes. */
export const scholarshipParamSchema = z.object({
  id: z.string().min(1),
  scholarshipId: z.string().min(1),
});

/** Body for POST /colleges/:id/scholarships/search. `.strict()` so a typo surfaces as 422 rather
 *  than being silently ignored. Everything is optional — the default is a broad "all" sweep. */
export const searchSchema = z
  .object({
    category: z.enum(SEARCH_CATEGORIES).optional(),
    /** Narrows an athletic search to one sport ("women's soccer"). Ignored for academic searches. */
    sport: z.string().max(80).optional(),
  })
  .strict();

/** Body for POST /colleges/:id/scholarships/:scholarshipId/research — no inputs today; `.strict()`
 *  keeps an accidental payload from looking like it did something. */
export const researchSchema = z.object({}).strict();

export type SearchInput = z.infer<typeof searchSchema>;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

// Request validation for the Peer Benchmark endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

/** Path param for the per-college routes: `/colleges/:id/benchmark[...]`. */
export const collegeParamSchema = z.object({ id: z.string().min(1) });

/** Body for POST /colleges/:id/benchmark/refresh. All fields optional — the refresh is driven by
 *  the college on the server; the body only carries optional hints. `.strict()` rejects typos. */
export const refreshSchema = z
  .object({
    /** Optional free-text steer for the AI research (e.g. "focus on direct-admit BSN"). */
    focus: z.string().max(500).optional(),
  })
  .strict();

export type RefreshInput = z.infer<typeof refreshSchema>;

/** Path params for the refresh-job poll route: `/colleges/:id/benchmark/refresh/:jobId`. */
export const refreshJobParamSchema = z.object({ id: z.string().min(1), jobId: z.string().min(1) });

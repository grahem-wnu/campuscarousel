// Async benchmark research. Researching a college's competitive profile is a web-grounded, multi-
// round Bedrock call (~60-140s) — far past API Gateway's hard ~30s integration ceiling — so it can't
// run inline in the request like it used to (that's why "Refresh Benchmark" silently timed out).
// Instead the handler enqueues a `benchmark-research` job and this runs on the shared 300s SQS
// worker (same path as college hydration). The student comparison is recomputed live on GET, so the
// worker persists only the college's profile + a family-visible comparison snapshot; nothing private.

import { compareToBenchmark, computeFitScore } from './compare.js';
import { gatherFamilyVisibleStats } from './gather.js';
import type { BenchmarkResearcher } from './researcher.js';
import type { Benchmark, Data } from '../../shared/data/index.js';

/** SQS message `type` discriminator for a single-college benchmark research job. */
export const BENCHMARK_RESEARCH_TYPE = 'benchmark-research';

export interface BenchmarkResearchMessage {
  type: typeof BENCHMARK_RESEARCH_TYPE;
  collegeId: string;
  focus?: string;
}

/** One seam for "research this college's benchmark". Production = SQS enqueue; tests/no-queue = inline. */
export type BenchmarkDispatcher = (collegeId: string, focus?: string) => Promise<void>;

/** Research one college's competitive profile and persist it, stamping hydrationStatus. On failure it
 *  marks the benchmark `failed` (surfaced to the UI via polling) rather than throwing — the request
 *  that enqueued this has already returned. No-op if the college is gone. */
export async function researchBenchmark(
  getData: () => Data,
  getResearcher: () => BenchmarkResearcher,
  collegeId: string,
  focus?: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  try {
    const majors = (await data.studentProfile.get())?.intendedMajors ?? [];
    const profile = await getResearcher().research(college, focus, majors);
    // Persisted comparison uses family-visible stats only (never private entries); the live per-
    // requester comparison is recomputed on GET /colleges/:id/benchmark.
    const familyStats = await gatherFamilyVisibleStats(data);
    const existing = await data.benchmarks.get(collegeId);
    const preview = { ...(existing ?? { collegeId }), ...profile } as Benchmark;
    const keirasComparison = compareToBenchmark(familyStats, preview);
    const merged = await data.benchmarks.mergePreservingUserEdits(collegeId, { ...profile, keirasComparison, hydrationStatus: 'complete' });
    // Auto-calculate the college fit score (spec's "Refresh Fit Analysis") from the family-visible
    // stats vs the freshly-researched benchmark. Only when computable, so we never clobber a real
    // score with undefined. fitScore is a system field (see HYDRATION_SYSTEM_FIELDS) so the update
    // doesn't mark it user-owned.
    const fitScore = computeFitScore(familyStats, merged);
    if (fitScore !== undefined) await data.colleges.update(collegeId, { fitScore });
  } catch (err) {
    console.error('[benchmark-research] research failed', collegeId, err);
    await data.benchmarks.mergePreservingUserEdits(collegeId, { hydrationStatus: 'failed' });
  }
}

/** Inline dispatcher — research now, within the call. Used by tests and as the no-queue fallback. */
export function makeInlineDispatcher(
  getData: () => Data,
  getResearcher: () => BenchmarkResearcher,
): BenchmarkDispatcher {
  return (collegeId, focus) => researchBenchmark(getData, getResearcher, collegeId, focus);
}

/** SQS worker-side handler for the shared `hydrationRegistry` (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  getResearcher: () => BenchmarkResearcher,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<BenchmarkResearchMessage>;
    if (typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    await researchBenchmark(getData, getResearcher, msg.collegeId, typeof msg.focus === 'string' ? msg.focus : undefined);
  };
}

// Peer Benchmark handlers. Benchmarks are FAMILY-VISIBLE (specs/modules/peer-benchmark.md
// "Privacy") — there is no `private` state on the benchmark itself. But Keira's comparison is
// computed from her real data, and two of those sources (clinical-hours, activity-journal) ARE
// visibility-bearing — so we run those source lists through the shared visibility middleware off
// the caller's JWT before aggregating. A parent therefore never has private-entry hours folded into
// the numbers they see. Handlers are built from `getData` / `getResearcher` thunks so tests inject
// fakes and production injects the live data client + Bedrock researcher (see routes.manifest.ts).

import {
  Errors,
  validate,
  validateParams,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import type { Benchmark, BenchmarkSnapshot, College, Data } from '../../shared/data/index.js';
import { buildAggregate, compareToBenchmark } from './compare.js';
import { gatherFamilyVisibleStats, gatherStats } from './gather.js';
import { makeSqsEnqueuer } from './enqueue.js';
import type { BenchmarkDispatcher } from './research.js';
import { buildSnapshot, mergeSnapshot, monthOf } from './snapshots.js';
import type { BenchmarkResearcher } from './researcher.js';
import { collegeParamSchema, refreshSchema } from './schema.js';

export interface BenchmarkHandlers {
  detail: Handler;
  refresh: Handler;
  aggregate: Handler;
  gaps: Handler;
}

/** Record at most one snapshot for the current calendar month and return the rolling trend. Uses
 *  family-visible stats (never private). Best-effort: a history write must never break the read, and
 *  an all-empty matrix (no benchmark data yet) isn't worth a point. */
async function recordMonthlySnapshot(
  data: Data,
  colleges: readonly College[],
  benchmarkOf: (collegeId: string) => Benchmark | null,
): Promise<BenchmarkSnapshot[]> {
  let snapshots: BenchmarkSnapshot[] = [];
  try {
    snapshots = (await data.benchmarkHistory.get())?.snapshots ?? [];
    const familyStats = await gatherFamilyVisibleStats(data);
    const rows = buildAggregate(familyStats, colleges, benchmarkOf).rows;
    if (!rows.some((r) => r.benchmark.hasData)) return snapshots;
    const nowIso = new Date().toISOString();
    const snap = buildSnapshot(monthOf(nowIso), nowIso, familyStats, rows);
    const saved = await data.benchmarkHistory.put(mergeSnapshot(snapshots, snap));
    return saved.snapshots;
  } catch {
    return snapshots;
  }
}

/** Read every college's benchmark once and index by collegeId. */
async function benchmarksByCollege(
  data: Data,
  collegeIds: readonly string[],
): Promise<Map<string, Benchmark | null>> {
  const found = await Promise.all(collegeIds.map((id) => data.benchmarks.get(id)));
  return new Map(collegeIds.map((id, i) => [id, found[i] ?? null]));
}

export function makeHandlers(
  getData: () => Data,
  getResearcher: () => BenchmarkResearcher,
  dispatcher?: BenchmarkDispatcher,
): BenchmarkHandlers {
  // Production: enqueue a `benchmark-research` job for the 300s SQS worker. Tests / no queue: the
  // enqueuer falls back to running the research inline, so the same handler stays synchronous there.
  const dispatch = dispatcher ?? makeSqsEnqueuer(getData, getResearcher);
  return {
    // GET /colleges/:id/benchmark — the stored benchmark (may be null) + Keira's freshly-computed
    // comparison against it. A null benchmark surfaces as the "insufficient data" empty state.
    detail: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const data = getData();
      const college = await data.colleges.get(id);
      if (!college) throw Errors.notFound('College not found');
      const [benchmark, keira] = await Promise.all([data.benchmarks.get(id), gatherStats(data, ctx.requester)]);
      return {
        status: 200,
        body: {
          college: { collegeId: college.collegeId, name: college.name },
          benchmark,
          keira,
          comparison: compareToBenchmark(keira, benchmark),
        },
      };
    },

    // POST /colleges/:id/benchmark/refresh — kick off the AI research. Web-grounded research blows
    // past API Gateway's ~30s ceiling, so we mark the benchmark `in-progress` and hand off to the
    // 300s async worker; the frontend polls hydrationStatus. Returns the current (now researching)
    // benchmark plus the caller's live comparison. (In tests / no queue the dispatcher runs the
    // research inline, so the benchmark is already `complete` by the time we re-read it.)
    refresh: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validate(refreshSchema, ctx.body ?? {});
      const data = getData();
      const college = await data.colleges.get(id);
      if (!college) throw Errors.notFound('College not found');

      await data.benchmarks.mergePreservingUserEdits(id, { hydrationStatus: 'in-progress' });
      await dispatch(id, input.focus);

      const [benchmark, keira] = await Promise.all([data.benchmarks.get(id), gatherStats(data, ctx.requester)]);
      return {
        status: 200,
        body: {
          college: { collegeId: college.collegeId, name: college.name },
          benchmark,
          keira,
          comparison: compareToBenchmark(keira, benchmark),
        },
      };
    },

    // GET /benchmarks/aggregate — the matrix: every college × metrics, with Keira's stats compared.
    // Also lazily records one snapshot per month and returns the progress-over-time `trend`.
    aggregate: async (ctx) => {
      const data = getData();
      const [colleges, keira] = await Promise.all([data.colleges.list(), gatherStats(data, ctx.requester)]);
      const byId = await benchmarksByCollege(data, colleges.map((c) => c.collegeId));
      const benchmarkOf = (cid: string): Benchmark | null => byId.get(cid) ?? null;
      const matrix = buildAggregate(keira, colleges, benchmarkOf);
      const trend = await recordMonthlySnapshot(data, colleges, benchmarkOf);
      return { status: 200, body: { ...matrix, trend } };
    },

    // GET /benchmarks/gaps — AI biggest-gaps analysis with specific recommendations.
    gaps: async (ctx) => {
      const data = getData();
      const [colleges, keira] = await Promise.all([data.colleges.list(), gatherStats(data, ctx.requester)]);
      const byId = await benchmarksByCollege(data, colleges.map((c) => c.collegeId));
      const matrix = buildAggregate(keira, colleges, (cid) => byId.get(cid) ?? null);
      const majors = (await data.studentProfile.get())?.intendedMajors ?? [];
      const analysis = await getResearcher().analyzeGaps(keira, matrix.rows, majors);
      return { status: 200, body: { keira, ...analysis } };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test.
 * Static `/benchmarks/*` routes and the nested `/colleges/:id/benchmark[...]` routes don't collide;
 * the longer/more-static path wins in the router.
 */
export function buildRoutes(handlers: BenchmarkHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/colleges/:id/benchmark', handler: handlers.detail },
    { method: 'POST', path: '/colleges/:id/benchmark/refresh', handler: handlers.refresh },
    { method: 'GET', path: '/benchmarks/aggregate', handler: handlers.aggregate },
    { method: 'GET', path: '/benchmarks/gaps', handler: handlers.gaps },
  ];
}

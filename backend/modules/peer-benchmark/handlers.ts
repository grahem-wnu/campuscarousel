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
import { filterForRequester, type Requester } from '../../shared/auth/index.js';
import type { Benchmark, Data } from '../../shared/data/index.js';
import { buildAggregate, compareToBenchmark } from './compare.js';
import { computeKeiraStats, type KeiraStats } from './stats.js';
import type { BenchmarkResearcher } from './researcher.js';
import { collegeParamSchema, refreshSchema } from './schema.js';

export interface BenchmarkHandlers {
  detail: Handler;
  refresh: Handler;
  aggregate: Handler;
  gaps: Handler;
}

/** Aggregate Keira's comparable stats, with clinical/volunteer hours visibility-filtered for the
 *  caller so a parent never sees private-entry hours folded in. Courses/TEAS/certs aren't
 *  visibility-bearing. */
async function gatherStats(data: Data, requester: Requester): Promise<KeiraStats> {
  const [courses, teas, clinical, activities, certifications] = await Promise.all([
    data.courses.list(),
    data.teas.list(),
    data.clinical.list(),
    data.activities.list(),
    data.certifications.list(),
  ]);
  return computeKeiraStats({
    courses,
    teas,
    certifications,
    clinical: filterForRequester(clinical, requester),
    activities: filterForRequester(activities, requester),
  });
}

/** Read every college's benchmark once and index by collegeId. */
async function benchmarksByCollege(
  data: Data,
  collegeIds: readonly string[],
): Promise<Map<string, Benchmark | null>> {
  const found = await Promise.all(collegeIds.map((id) => data.benchmarks.get(id)));
  return new Map(collegeIds.map((id, i) => [id, found[i] ?? null]));
}

export function makeHandlers(getData: () => Data, getResearcher: () => BenchmarkResearcher): BenchmarkHandlers {
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

    // POST /colleges/:id/benchmark/refresh — AI researches the competitive profile, merged into the
    // stored benchmark (preserving any human-edited fields), then Keira's comparison is recomputed
    // against the persisted numbers.
    refresh: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validate(refreshSchema, ctx.body ?? {});
      const data = getData();
      const college = await data.colleges.get(id);
      if (!college) throw Errors.notFound('College not found');

      const profile = await getResearcher().research(college, input.focus);
      const merged = await data.benchmarks.mergePreservingUserEdits(id, profile);
      const keira = await gatherStats(data, ctx.requester);
      const comparison = compareToBenchmark(keira, merged);
      const saved = await data.benchmarks.mergePreservingUserEdits(id, { keirasComparison: comparison });

      return {
        status: 200,
        body: {
          college: { collegeId: college.collegeId, name: college.name },
          benchmark: saved,
          keira,
          comparison,
        },
      };
    },

    // GET /benchmarks/aggregate — the matrix: every college × metrics, with Keira's stats compared.
    aggregate: async (ctx) => {
      const data = getData();
      const [colleges, keira] = await Promise.all([data.colleges.list(), gatherStats(data, ctx.requester)]);
      const byId = await benchmarksByCollege(data, colleges.map((c) => c.collegeId));
      return { status: 200, body: buildAggregate(keira, colleges, (cid) => byId.get(cid) ?? null) };
    },

    // GET /benchmarks/gaps — AI biggest-gaps analysis with specific recommendations.
    gaps: async (ctx) => {
      const data = getData();
      const [colleges, keira] = await Promise.all([data.colleges.list(), gatherStats(data, ctx.requester)]);
      const byId = await benchmarksByCollege(data, colleges.map((c) => c.collegeId));
      const matrix = buildAggregate(keira, colleges, (cid) => byId.get(cid) ?? null);
      const analysis = await getResearcher().analyzeGaps(keira, matrix.rows);
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

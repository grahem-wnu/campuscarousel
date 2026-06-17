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
import type { Benchmark, BenchmarkSnapshot, College, Data } from '../../shared/data/index.js';
import { buildAggregate, compareToBenchmark } from './compare.js';
import { computeKeiraStats, type KeiraStats } from './stats.js';
import { buildSnapshot, mergeSnapshot, monthOf } from './snapshots.js';
import type { BenchmarkResearcher } from './researcher.js';
import { collegeParamSchema, refreshJobParamSchema, refreshSchema } from './schema.js';
import { runRefreshJob, type RefreshDispatcher } from './refresh-job.js';

export interface BenchmarkHandlers {
  detail: Handler;
  refresh: Handler;
  refreshStatus: Handler;
  aggregate: Handler;
  gaps: Handler;
}

/** Aggregate Keira's comparable stats, with experience/volunteer hours visibility-filtered for the
 *  caller so a parent never sees private-entry hours folded in. Courses/exams/certs aren't
 *  visibility-bearing. */
async function gatherStats(data: Data, requester: Requester): Promise<KeiraStats> {
  const [courses, exams, experiences, activities, certifications] = await Promise.all([
    data.courses.list(),
    data.exams.list(),
    data.experiences.list(),
    data.activities.list(),
    data.certifications.list(),
  ]);
  return computeKeiraStats({
    courses,
    exams,
    certifications,
    experiences: filterForRequester(experiences, requester),
    activities: filterForRequester(activities, requester),
  });
}

/** Family-visible stats: private entries ALWAYS excluded, regardless of caller. This is the basis
 *  for the PERSISTED monthly trend, which is family-visible and must never embed Keira's
 *  private-entry hours (a parent viewing the trend later would otherwise see them). */
async function gatherFamilyVisibleStats(data: Data): Promise<KeiraStats> {
  const [courses, exams, experiences, activities, certifications] = await Promise.all([
    data.courses.list(),
    data.exams.list(),
    data.experiences.list(),
    data.activities.list(),
    data.certifications.list(),
  ]);
  return computeKeiraStats({
    courses,
    exams,
    certifications,
    experiences: experiences.filter((e) => e.visibility !== 'private'),
    activities: activities.filter((a) => a.visibility !== 'private'),
  });
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
  getDispatch?: () => RefreshDispatcher,
): BenchmarkHandlers {
  // Default dispatcher (tests / no queue): run the job inline with the SAME researcher the handlers
  // were given, so an injected fake drives the inline run. Production injects an SQS enqueuer.
  const dispatch: RefreshDispatcher =
    getDispatch?.() ?? ((jobId) => runRefreshJob(getData, getResearcher(), jobId));
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

    // POST /colleges/:id/benchmark/refresh — ASYNC. Web-grounded research of the competitive profile
    // can exceed API Gateway's 30s ceiling, so we create a pending job and enqueue it (the 300s SQS
    // worker runs the research and merges it into the stored benchmark, preserving human edits). The
    // frontend polls refreshStatus, then reloads the benchmark. Returns 202 with the created job.
    refresh: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validate(refreshSchema, ctx.body ?? {});
      const data = getData();
      const college = await data.colleges.get(id);
      if (!college) throw Errors.notFound('College not found');

      const job = await data.benchmarkRefreshJobs.create({
        collegeId: id,
        status: 'pending',
        ...(input.focus ? { focus: input.focus } : {}),
      });
      await dispatch(job.jobId);
      const after = await data.benchmarkRefreshJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /colleges/:id/benchmark/refresh/:jobId — poll a refresh job's status.
    refreshStatus: async (ctx) => {
      const { jobId } = validateParams(refreshJobParamSchema, ctx);
      const job = await getData().benchmarkRefreshJobs.get(jobId);
      if (!job) throw Errors.notFound('Refresh job not found');
      return { status: 200, body: job };
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
    { method: 'GET', path: '/colleges/:id/benchmark/refresh/:jobId', handler: handlers.refreshStatus },
    { method: 'GET', path: '/benchmarks/aggregate', handler: handlers.aggregate },
    { method: 'GET', path: '/benchmarks/gaps', handler: handlers.gaps },
  ];
}

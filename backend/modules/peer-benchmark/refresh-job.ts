// Async peer-benchmark refresh. Web-grounded research of a school's typical-admit competitive
// profile can exceed the routing Lambda's 30s budget, so — exactly like college hydration/discovery —
// the API creates a job and enqueues it, the 300s SQS worker runs the research and writes the merged
// benchmark back, and the frontend polls until the job settles (then reloads the benchmark).
//
// It REUSES the hydration queue but registers its OWN message `type` ('benchmark-refresh'), so the
// worker entry routes it to this module's handler (see refresh.manifest.ts). No new queue plumbing.

import type { Data } from '../../shared/data/index.js';
import type { Benchmark } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { compareToBenchmark } from './compare.js';
import { computeKeiraStats, type KeiraStats } from './stats.js';
import type { BenchmarkResearcher } from './researcher.js';
import { bedrockResearcher } from './bedrock.js';

/** SQS message type for a benchmark-refresh job. Distinct from college hydration/discovery. */
export const BENCHMARK_REFRESH_TYPE = 'benchmark-refresh' as const;

/** SQS message for a benchmark-refresh job. Carries the tenant/student so the worker scopes data. */
export interface BenchmarkRefreshMessage {
  type: typeof BENCHMARK_REFRESH_TYPE;
  jobId: string;
  tenantId: string;
  studentId: string;
}

/** Family-visible stats: private entries ALWAYS excluded. The persisted `keirasComparison` is
 *  family-visible (a parent may read the stored benchmark), so it must never embed private-entry
 *  hours; the per-caller live comparison is recomputed off the JWT by GET /benchmark. */
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

/** Run one refresh job: fetch it, research the college's competitive profile, merge it into the
 *  stored benchmark (preserving human edits) with a recomputed family-visible comparison, and mark
 *  the job complete. No-op if the job is gone; a genuine failure marks the job `failed` so the UI
 *  surfaces it instead of spinning forever. */
export async function runRefreshJob(
  getData: () => Data,
  researcher: BenchmarkResearcher,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.benchmarkRefreshJobs.get(jobId);
  if (!job) return;
  try {
    const college = await data.colleges.get(job.collegeId);
    if (!college) throw new Error('College not found');
    const majors = (await data.studentProfile.get())?.intendedMajors ?? [];
    const [profile, keira] = await Promise.all([
      researcher.research(college, job.focus, majors),
      gatherFamilyVisibleStats(data),
    ]);
    const existing = await data.benchmarks.get(job.collegeId);
    const preview = { ...(existing ?? { collegeId: job.collegeId }), ...profile } as Benchmark;
    const comparison = compareToBenchmark(keira, preview);
    await data.benchmarks.mergePreservingUserEdits(job.collegeId, { ...profile, keirasComparison: comparison });
    await data.benchmarkRefreshJobs.update(jobId, { status: 'complete' });
  } catch (err) {
    await data.benchmarkRefreshJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'benchmark refresh failed',
    });
  }
}

/** Worker-side handler for a refresh-job payload (`{ jobId }`). */
export function makeRefreshWorkerHandler(
  getData: () => Data,
  researcher: BenchmarkResearcher = bedrockResearcher,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<BenchmarkRefreshMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runRefreshJob(getData, researcher, msg.jobId);
  };
}

/** One seam for "start this refresh job". Production enqueues to SQS; falls back to inline. */
export type RefreshDispatcher = (jobId: string) => Promise<void>;

/** Minimal structural type of the SQS client (just `send`) — injectable without the SDK class. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsRefreshEnqueuerOptions {
  /** Researcher used by the inline fallback (no queue configured); defaults to the Bedrock binding. */
  researcher?: BenchmarkResearcher;
  /** Queue URL; defaults to `process.env.HYDRATION_QUEUE_URL` (shared with hydration/discovery). */
  queueUrl?: string;
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to running the job inline. */
  fallback?: RefreshDispatcher;
}

/** A dispatcher that enqueues a refresh job for the SQS worker (shared hydration queue, own type). */
export function makeSqsRefreshEnqueuer(
  getData: () => Data,
  options: SqsRefreshEnqueuerOptions = {},
): RefreshDispatcher {
  const researcher = options.researcher ?? bedrockResearcher;
  const fallback = options.fallback ?? ((jobId: string) => runRefreshJob(getData, researcher, jobId));
  return async (jobId) => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(jobId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: BENCHMARK_REFRESH_TYPE,
            jobId,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          } as BenchmarkRefreshMessage),
        }),
      );
    } catch {
      await fallback(jobId);
    }
  };
}

// Async college discovery. Web-grounded discovery (searching the web for programs matching the
// student's intended major) can
// exceed the routing Lambda's 30s budget, so — exactly like hydration — the API creates a job and
// enqueues it, the 300s SQS worker runs the search and writes the candidates back, and the frontend
// polls until the job settles.
//
// It REUSES the hydration queue + worker registration: the worker routes by message shape — a message
// carrying `jobId` is a discovery job, one carrying `collegeId` is a hydration job (see
// hydration.manifest.ts). That keeps one queue/worker and needs no new registry plumbing.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import type { DiscoverInput } from './schema.js';
import { makeBedrockDiscoverer, type Discoverer } from './ai.js';
import { HYDRATION_TYPE } from './hydration.js';

/** SQS message for a discovery job (shares the hydration queue/type; `jobId` selects the discover path). */
export interface CollegeDiscoverMessage {
  type: typeof HYDRATION_TYPE;
  jobId: string;
  tenantId: string;
  studentId: string;
}

/** Resolve the discoverer for a run: an explicitly-injected one is used as-is (tests); otherwise we
 *  build the Bedrock discoverer with the student's intended majors so the search is major-aware.
 *  Discovery runs in the active-student context, so studentProfile is reachable here. */
async function resolveDiscoverer(getData: () => Data, injected?: Discoverer): Promise<Discoverer> {
  if (injected) return injected;
  let majors: string[] = [];
  try {
    majors = (await getData().studentProfile.get())?.intendedMajors ?? [];
  } catch {
    majors = [];
  }
  return makeBedrockDiscoverer({}, majors);
}

/** Run one discovery job: fetch it, run the (web-grounded) discoverer, write the candidates back.
 *  No-op if the job is gone. The discoverer never throws (returns [] on error); a genuine failure
 *  here marks the job `failed` so the UI can surface it instead of spinning forever. */
export async function runDiscoveryJob(
  getData: () => Data,
  discoverer: Discoverer | undefined,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.discoveryJobs.get(jobId);
  if (!job) return;
  try {
    const resolved = await resolveDiscoverer(getData, discoverer);
    const candidates = await resolved((job.filters ?? {}) as DiscoverInput);
    await data.discoveryJobs.update(jobId, {
      status: 'complete',
      candidates,
      count: candidates.length,
    });
  } catch (err) {
    await data.discoveryJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'discovery failed',
    });
  }
}

/** Worker-side handler for a discovery job payload (`{ jobId }`). */
export function makeDiscoverWorkerHandler(
  getData: () => Data,
  discoverer?: Discoverer,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CollegeDiscoverMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runDiscoveryJob(getData, discoverer, msg.jobId);
  };
}

/** One seam for "start this discovery job". Production enqueues to SQS; falls back to inline. */
export type DiscoverDispatcher = (jobId: string) => Promise<void>;

/** Minimal structural type of the SQS client (just `send`) — injectable without the SDK class. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsDiscoverEnqueuerOptions {
  /** Queue URL; defaults to `process.env.HYDRATION_QUEUE_URL` (shared with hydration). */
  queueUrl?: string;
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to running the job inline. */
  fallback?: DiscoverDispatcher;
}

/** A dispatcher that enqueues a discovery job for the SQS worker (shared hydration queue). */
export function makeSqsDiscoverEnqueuer(
  getData: () => Data,
  options: SqsDiscoverEnqueuerOptions = {},
): DiscoverDispatcher {
  const fallback =
    options.fallback ?? ((jobId: string) => runDiscoveryJob(getData, undefined, jobId));
  return async (jobId) => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(jobId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ type: HYDRATION_TYPE, jobId, tenantId: currentTenantId(), studentId: currentStudentId() } as CollegeDiscoverMessage),
        }),
      );
    } catch {
      await fallback(jobId);
    }
  };
}

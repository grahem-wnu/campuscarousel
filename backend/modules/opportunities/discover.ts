// Async discovery plumbing for Module 18 (mirrors college-hub). The API creates a job + enqueues it;
// the SQS worker runs the web-grounded discoverer and writes candidates back; the frontend polls.
// Uses its own message type ('opportunity-discover') on the shared hydration queue. Degrades to an
// inline run when no queue is configured (tests/local), so the flow works without AWS.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { makeBedrockDiscoverer, type Discoverer, type DiscoverInput } from './ai.js';

export const DISCOVER_TYPE = 'opportunity-discover';

export interface OpportunityDiscoverMessage {
  type: typeof DISCOVER_TYPE;
  jobId: string;
  tenantId: string;
  studentId: string;
}

export type DiscoverDispatcher = (jobId: string) => Promise<void>;

/** Run one discovery job: fetch it, run the (web-grounded) discoverer, write candidates back. The
 *  discoverer never throws (returns [] on error); a genuine failure here marks the job `failed`. */
export async function runDiscoveryJob(
  getData: () => Data,
  discoverer: Discoverer,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.opportunityDiscoveryJobs.get(jobId);
  if (!job) return;
  try {
    const candidates = await discoverer((job.filters ?? {}) as DiscoverInput);
    await data.opportunityDiscoveryJobs.update(jobId, {
      status: 'complete',
      candidates,
      count: candidates.length,
    });
  } catch (err) {
    await data.opportunityDiscoveryJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'discovery failed',
    });
  }
}

/** Worker-side handler for a discovery job payload (`{ jobId }`). */
export function makeDiscoverWorkerHandler(
  getData: () => Data,
  discoverer: Discoverer = makeBedrockDiscoverer(),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<OpportunityDiscoverMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runDiscoveryJob(getData, discoverer, msg.jobId);
  };
}

export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface DiscoverEnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
  fallback?: DiscoverDispatcher;
}

/** A dispatcher that enqueues an `opportunity-discover` job for the SQS worker, or runs inline if
 *  no queue is configured / the send fails. */
export function makeSqsDiscoverEnqueuer(
  getData: () => Data,
  options: DiscoverEnqueuerOptions = {},
): DiscoverDispatcher {
  const fallback =
    options.fallback ?? ((jobId: string) => runDiscoveryJob(getData, makeBedrockDiscoverer(), jobId));
  return async (jobId) => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(jobId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ type: DISCOVER_TYPE, jobId, tenantId: currentTenantId(), studentId: currentStudentId() }),
        }),
      );
    } catch {
      await fallback(jobId);
    }
  };
}

// SQS enqueuer for async cert-guidance research — mirrors peer-benchmark/enqueue.ts. The API enqueues
// a `cert-guidance` job onto the shared hydration queue and returns immediately; the 300s SQS worker
// does the web-grounded Bedrock research. On any enqueue failure (no queue configured, send error) it
// falls back to the inline dispatcher so the action degrades to "works but slow" rather than broken —
// and the failure is logged, not swallowed.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import {
  CERT_GUIDANCE_TYPE,
  makeInlineDispatcher,
  type CertGuidanceResearcher,
  type GuidanceDispatcher,
} from './guidance.js';

/** Minimal structural type of the SQS client (just `send`) — keeps tests injectable. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsGuidanceEnqueuerOptions {
  /** Queue URL; defaults to `process.env.HYDRATION_QUEUE_URL` (the shared hydration/research queue). */
  queueUrl?: string;
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to inline research. */
  fallback?: GuidanceDispatcher;
}

/** A dispatcher that enqueues a `cert-guidance` job for the SQS worker. */
export function makeSqsGuidanceEnqueuer(
  getData: () => Data,
  researcher: CertGuidanceResearcher,
  options: SqsGuidanceEnqueuerOptions = {},
): GuidanceDispatcher {
  const fallback = options.fallback ?? makeInlineDispatcher(getData, researcher);
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
            type: CERT_GUIDANCE_TYPE,
            jobId,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch (err) {
      console.error('[cert-guidance] enqueue failed, falling back to inline research', { jobId, err });
      await fallback(jobId);
    }
  };
}

// SQS enqueuer for async college hydration. Now that @aws-sdk/client-sqs is a backend dependency and
// the hydration-bundle build globs module hydration.manifest.ts into the worker (so an enqueued
// `college-hydrate` message actually reaches college-hub's worker handler), the API enqueues instead
// of hydrating inline. The routing Lambda returns immediately; the 300s SQS worker does the Bedrock
// work; the frontend polls hydrationStatus. This is the spec-mandated async path.
//
// Injectable (queue url + client) for tests. On any enqueue failure (no queue configured, send
// error) it falls back to the inline dispatcher so /hydrate is never left hard-broken — degraded but
// functional, and the failure is contained to that request.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { HYDRATION_TYPE, makeInlineDispatcher, type HydrationDispatcher } from './hydration.js';

/** Minimal structural type of the SQS client (just `send`) — keeps tests injectable without a hard
 *  dependency on the SDK's concrete class. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsEnqueuerOptions {
  /** Queue URL; defaults to `process.env.HYDRATION_QUEUE_URL` (injected by CDK from the AsyncStack). */
  queueUrl?: string;
  /** Injectable client (tests); defaults to a real `SQSClient`. */
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to inline hydration. */
  fallback?: HydrationDispatcher;
}

/** A dispatcher that enqueues a `college-hydrate` job for the SQS worker. */
export function makeSqsEnqueuer(getData: () => Data, options: SqsEnqueuerOptions = {}): HydrationDispatcher {
  const fallback = options.fallback ?? makeInlineDispatcher(getData);
  return async (collegeId) => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(collegeId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ type: HYDRATION_TYPE, collegeId, tenantId: currentTenantId(), studentId: currentStudentId() }),
        }),
      );
    } catch {
      // Queue unavailable / send failed — hydrate inline so the request still completes.
      await fallback(collegeId);
    }
  };
}

// SQS enqueuer for async benchmark research — mirrors college-hub/enqueue.ts. The API enqueues a
// `benchmark-research` job onto the shared hydration queue and returns immediately; the 300s SQS
// worker does the web-grounded Bedrock research. On any enqueue failure (no queue configured, send
// error) it falls back to the inline dispatcher so the action degrades to "works but slow" rather
// than hard-broken — and the failure is logged, not swallowed.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { BENCHMARK_RESEARCH_TYPE, makeInlineDispatcher, type BenchmarkDispatcher } from './research.js';
import type { BenchmarkResearcher } from './researcher.js';

/** Minimal structural type of the SQS client (just `send`) — keeps tests injectable. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsEnqueuerOptions {
  /** Queue URL; defaults to `process.env.HYDRATION_QUEUE_URL` (the shared hydration/research queue). */
  queueUrl?: string;
  /** Injectable client (tests); defaults to a real `SQSClient`. */
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to inline research. */
  fallback?: BenchmarkDispatcher;
}

/** A dispatcher that enqueues a `benchmark-research` job for the SQS worker. */
export function makeSqsEnqueuer(
  getData: () => Data,
  getResearcher: () => BenchmarkResearcher,
  options: SqsEnqueuerOptions = {},
): BenchmarkDispatcher {
  const fallback = options.fallback ?? makeInlineDispatcher(getData, getResearcher);
  return async (collegeId, focus) => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(collegeId, focus);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: BENCHMARK_RESEARCH_TYPE,
            collegeId,
            focus,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch (err) {
      console.error('[benchmark-research] enqueue failed, falling back to inline research', { collegeId, err });
      await fallback(collegeId, focus);
    }
  };
}

// Async essay evaluation. Model-only Bedrock, but a rubric review runs ~15–20s — near API Gateway's
// hard ~30s ceiling — so the handler enqueues a job and this runs on the shared 300s essay-coach worker,
// writing the result back for the frontend to poll. Same shape as practice.ts (the questions job); routed
// on the shared essay-coach queue by `kind: 'review'`.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { gatherCollegeContext } from './grounding.js';
import { makeBedrockEssayReviewer, type EssayReviewer } from './ai.js';
import { ESSAY_COACH_TYPE, type SqsSender } from './practice.js';

export type { SqsSender };

/** One seam for "run this evaluation job". Production = SQS enqueue; tests/no-queue = inline. */
export type ReviewDispatcher = (jobId: string) => Promise<void>;

/** Run one evaluation job: read it, resolve college context, evaluate, write result. No-op if the job is
 *  gone; a genuine failure marks it `failed` (surfaced via polling) rather than throwing. */
export async function runReviewJob(
  getData: () => Data,
  reviewer: EssayReviewer,
  now: () => Date,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.essayReviewJobs.get(jobId);
  if (!job) return;
  try {
    const essay = await data.essays.get(job.essayId);
    if (!essay) throw new Error('essay not found');
    const content = job.content ?? '';
    const college = await gatherCollegeContext(data, essay.collegeId);
    const review = await reviewer({ prompt: essay.prompt ?? '', content, targetWords: job.targetWords ?? essay.targetWords, college });
    await data.essayReviewJobs.update(jobId, { status: 'complete', result: review });
    if (review.source === 'ai' && review.overall !== undefined && review.verdict !== undefined) {
      await data.essays.update(job.essayId, {
        lastReview: { overall: review.overall, verdict: review.verdict, wordCount: review.wordCount, reviewedAt: now().toISOString() },
      });
    }
  } catch (err) {
    console.error('[essay-review] evaluation failed', jobId, err);
    await data.essayReviewJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'essay evaluation failed',
    });
  }
}

/** Inline dispatcher — evaluate now, within the call. Tests + no-queue fallback. */
export function makeInlineReviewDispatcher(
  getData: () => Data,
  reviewer: EssayReviewer,
  now: () => Date,
): ReviewDispatcher {
  return (jobId) => runReviewJob(getData, reviewer, now, jobId);
}

/** SQS worker-side handler for the shared hydration registry (payload → Promise<void>). */
export function makeReviewWorkerHandler(
  getData: () => Data,
  reviewer: EssayReviewer,
  now: () => Date,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as { jobId?: unknown };
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runReviewJob(getData, reviewer, now, msg.jobId);
  };
}

export interface SqsReviewEnqueuerOptions {
  /** Defaults to ESSAY_COACH_QUEUE_URL (dedicated lane) then FOCUS_QUEUE_URL then HYDRATION_QUEUE_URL. */
  queueUrl?: string;
  client?: SqsSender;
  fallback?: ReviewDispatcher;
}

/** Production dispatcher: enqueue an `essay-coach` (kind: 'review') job onto the dedicated essay-coach
 *  lane (fallback focus/hydration). On any enqueue failure, degrade to inline evaluation (logged). */
export function makeSqsReviewEnqueuer(
  getData: () => Data,
  reviewer: EssayReviewer,
  now: () => Date,
  options: SqsReviewEnqueuerOptions = {},
): ReviewDispatcher {
  const fallback = options.fallback ?? makeInlineReviewDispatcher(getData, reviewer, now);
  return async (jobId) => {
    const queueUrl =
      options.queueUrl ?? process.env.ESSAY_COACH_QUEUE_URL ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(jobId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: ESSAY_COACH_TYPE,
            kind: 'review',
            jobId,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch (err) {
      console.error('[essay-review] enqueue failed, falling back to inline evaluation', { jobId, err });
      await fallback(jobId);
    }
  };
}

/** Re-export the default reviewer for the manifest + routes wiring. */
export { makeBedrockEssayReviewer };

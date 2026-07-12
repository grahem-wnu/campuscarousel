// Async practice-question generation. Model-only Bedrock, but generating ~5 detailed questions runs
// ~25–30s and 503s at API Gateway's hard ~30s ceiling — so the handler enqueues a job and this runs on
// the shared 300s worker, writing the result back for the frontend to poll. (Same shape as
// certifications/guidance.ts; unlike it, this is NOT web-grounded — just slow output.)

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { gatherCollegeContext, type CollegeContext } from './grounding.js';
import { makeBedrockPracticeQuestions, type PracticeQuestionGenerator } from './ai.js';

export const ESSAY_COACH_TYPE = 'essay-coach';

export interface PracticeQuestionMessage {
  type: typeof ESSAY_COACH_TYPE;
  kind: 'questions';
  jobId: string;
}

/** One seam for "run this practice job". Production = SQS enqueue; tests/no-queue = inline. */
export type PracticeDispatcher = (jobId: string) => Promise<void>;
/** Resolve the active student's intended majors (for major-aware prompts). Injectable for tests. */
export type MajorsResolver = (data: Data) => Promise<string[]>;

/** Default majors resolver — reads the per-student profile, [] on any miss. */
export const majorsFromProfile: MajorsResolver = async (data) => {
  try {
    return (await data.studentProfile.get())?.intendedMajors ?? [];
  } catch {
    return [];
  }
};

/** Run one practice job: read it, resolve college context, generate, write result. No-op if the job is
 *  gone; a genuine failure marks it `failed` (surfaced via polling) rather than throwing. */
export async function runPracticeJob(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.practiceQuestionJobs.get(jobId);
  if (!job) return;
  try {
    const college: CollegeContext | undefined = job.collegeId
      ? await gatherCollegeContext(data, job.collegeId)
      : job.collegeName
        ? { collegeId: '', name: job.collegeName }
        : undefined;
    const set = await generator({ college, majors: await majors(data), count: job.count });
    await data.practiceQuestionJobs.update(jobId, {
      status: 'complete',
      result: { ...set, collegeName: college?.name, usedRealPrompts: (college?.essayPrompts?.length ?? 0) > 0 },
    });
  } catch (err) {
    console.error('[practice-questions] generation failed', jobId, err);
    await data.practiceQuestionJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'practice question generation failed',
    });
  }
}

/** Inline dispatcher — generate now, within the call. Tests + no-queue fallback. */
export function makeInlineDispatcher(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver = majorsFromProfile,
): PracticeDispatcher {
  return (jobId) => runPracticeJob(getData, generator, majors, jobId);
}

/** SQS worker-side handler for the shared hydration registry (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver = majorsFromProfile,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<PracticeQuestionMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runPracticeJob(getData, generator, majors, msg.jobId);
  };
}

/** Minimal structural type of the SQS client (just `send`). */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsPracticeEnqueuerOptions {
  /** Defaults to ESSAY_COACH_QUEUE_URL (dedicated lane) then FOCUS_QUEUE_URL then HYDRATION_QUEUE_URL. */
  queueUrl?: string;
  client?: SqsSender;
  fallback?: PracticeDispatcher;
}

/** Production dispatcher: enqueue an `essay-coach` (kind: 'questions') job onto the dedicated essay-coach
 *  lane (fallback focus/hydration). On any enqueue failure, degrade to inline generation (logged). */
export function makeSqsPracticeEnqueuer(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  options: SqsPracticeEnqueuerOptions = {},
): PracticeDispatcher {
  const fallback = options.fallback ?? makeInlineDispatcher(getData, generator);
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
            kind: 'questions',
            jobId,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch (err) {
      console.error('[practice-questions] enqueue failed, falling back to inline generation', { jobId, err });
      await fallback(jobId);
    }
  };
}

/** Re-export the default generator for the manifest + routes wiring. */
export { makeBedrockPracticeQuestions };

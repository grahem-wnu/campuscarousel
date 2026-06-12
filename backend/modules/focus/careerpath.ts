// Async plumbing for the Career Path (sibling to the focus overview). POST /focus/career-path marks
// the per-student career-path singleton `pending` and enqueues a job; the SQS worker runs the
// web-grounded generator from the student's FREE-TEXT career goal and writes the roadmap back; the
// Focus page polls GET /focus. Shares the focus-overview message `type` with a `kind: 'career'`
// discriminator (one registered worker handler routes the two), and the same async-or-inline rule:
// web search exceeds the API 30s budget, so it never runs on the request path in prod.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { OVERVIEW_TYPE } from './overview.js';
import { makeBedrockCareerPathGenerator, type FocusOverviewer } from './ai.js';

export const CAREER_KIND = 'career';

export interface CareerPathMessage {
  type: typeof OVERVIEW_TYPE;
  kind: typeof CAREER_KIND;
  tenantId: string;
  studentId: string;
}

export type CareerDispatcher = () => Promise<void>;

/** Resolve the generator: an injected one (tests), else Bedrock bound to the student's career goal + major. */
async function resolveGenerator(getData: () => Data, injected?: FocusOverviewer): Promise<FocusOverviewer> {
  if (injected) return injected;
  let careerGoal = '';
  let majors: string[] = [];
  try {
    const profile = await getData().studentProfile.get();
    careerGoal = profile?.careerGoal ?? '';
    majors = profile?.intendedMajors ?? [];
  } catch {
    careerGoal = '';
  }
  return makeBedrockCareerPathGenerator({}, careerGoal, majors);
}

/** Run the career-path job: read the career goal, run the (web-grounded) generator, write the roadmap
 *  onto the career-path singleton. The generator throws on failure → we mark it `failed`. */
export async function runCareerPathJob(getData: () => Data, generator?: FocusOverviewer): Promise<void> {
  const data = getData();
  const careerGoal = (await data.studentProfile.get())?.careerGoal ?? '';
  try {
    const resolved = await resolveGenerator(getData, generator);
    const { overview, sources } = await resolved();
    await data.careerPath.put({ status: 'complete', generatedFor: [careerGoal], overview, sources });
  } catch (err) {
    await data.careerPath.put({
      status: 'failed',
      generatedFor: [careerGoal],
      error: err instanceof Error ? err.message : 'career path failed',
    });
  }
}

/** Worker-side handler for a career-path message (`kind: 'career'`). */
export function makeCareerWorkerHandler(
  getData: () => Data,
  generator?: FocusOverviewer,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CareerPathMessage>;
    if (msg.type !== OVERVIEW_TYPE || msg.kind !== CAREER_KIND) return;
    await runCareerPathJob(getData, generator);
  };
}

export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface CareerEnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
  fallback?: CareerDispatcher;
}

/** A dispatcher that enqueues a career-path job for the SQS worker, or runs inline if no queue is
 *  configured / the send fails. */
export function makeSqsCareerEnqueuer(
  getData: () => Data,
  options: CareerEnqueuerOptions = {},
): CareerDispatcher {
  const fallback = options.fallback ?? (() => runCareerPathJob(getData, undefined));
  return async () => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback();
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: OVERVIEW_TYPE,
            kind: CAREER_KIND,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch {
      await fallback();
    }
  };
}

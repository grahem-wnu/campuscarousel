// Async plumbing for the Focus overview (mirrors college-hub discovery). POST /focus/overview marks
// the per-student overview singleton `pending` and enqueues a job; the SQS worker runs the web-grounded
// overviewer and writes the prose + sources back; the Focus page polls GET /focus. Web search blows
// past the API Gateway 30s budget, so this MUST be async — never inline on the request path in prod.
// Degrades to an inline run when no queue is configured (tests/local) so the flow works without AWS.

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { makeBedrockFocusOverviewer, type FocusOverviewer } from './ai.js';

export const OVERVIEW_TYPE = 'focus-overview';

export interface FocusOverviewMessage {
  type: typeof OVERVIEW_TYPE;
  tenantId: string;
  studentId: string;
}

export type OverviewDispatcher = () => Promise<void>;

/** Resolve the overviewer for a run: an injected one is used as-is (tests); otherwise build the
 *  Bedrock overviewer bound to the active student's intended majors + career goal so it's specific. */
async function resolveOverviewer(getData: () => Data, injected?: FocusOverviewer): Promise<FocusOverviewer> {
  if (injected) return injected;
  let majors: string[] = [];
  let careerGoal: string | undefined;
  let graduationYear: number | undefined;
  try {
    const profile = await getData().studentProfile.get();
    majors = profile?.intendedMajors ?? [];
    careerGoal = profile?.careerGoal;
    graduationYear = profile?.graduationYear;
  } catch {
    majors = [];
  }
  return makeBedrockFocusOverviewer({}, majors, careerGoal, graduationYear);
}

/** Run the overview job: read the student's majors, run the (web-grounded) overviewer, write the
 *  result onto the focus-overview singleton. The overviewer throws on failure → we mark it `failed`. */
export async function runOverviewJob(getData: () => Data, overviewer?: FocusOverviewer): Promise<void> {
  const data = getData();
  const majors = (await data.studentProfile.get())?.intendedMajors ?? [];
  try {
    const resolved = await resolveOverviewer(getData, overviewer);
    const { overview, sources } = await resolved();
    await data.focusOverview.put({ status: 'complete', generatedFor: majors, overview, sources });
  } catch (err) {
    await data.focusOverview.put({
      status: 'failed',
      generatedFor: majors,
      error: err instanceof Error ? err.message : 'overview failed',
    });
  }
}

/** Worker-side handler for a focus-overview message. The job carries no payload beyond tenant/student
 *  (the worker already runs inside that context); the majors are read fresh from the profile. */
export function makeOverviewWorkerHandler(
  getData: () => Data,
  overviewer?: FocusOverviewer,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<FocusOverviewMessage>;
    if (msg.type !== OVERVIEW_TYPE) return;
    await runOverviewJob(getData, overviewer);
  };
}

export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface OverviewEnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
  fallback?: OverviewDispatcher;
}

/** A dispatcher that enqueues a `focus-overview` job for the SQS worker, or runs inline if no queue is
 *  configured / the send fails (so local + tests still produce an overview). */
export function makeSqsOverviewEnqueuer(
  getData: () => Data,
  options: OverviewEnqueuerOptions = {},
): OverviewDispatcher {
  const fallback = options.fallback ?? (() => runOverviewJob(getData, undefined));
  return async () => {
    // Interactive lane: prefer the dedicated focus queue so a user-initiated "Generate" never queues
    // behind bulk college hydration. Falls back to the shared hydration queue (and then inline) so
    // local/dev/tests and any env without FOCUS_QUEUE_URL set still work.
    const queueUrl = options.queueUrl ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback();
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: OVERVIEW_TYPE,
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

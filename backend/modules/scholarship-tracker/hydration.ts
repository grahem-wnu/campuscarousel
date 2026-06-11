// Hydration orchestration for Scholarship Tracker. The AI work lives in ai.ts (`Hydrator`); this
// file wires it to the data layer and exposes the trigger paths behind seams (mirrors
// backend/modules/college-hub/hydration.ts):
//
//   • makeInlineDispatcher — hydrate one scholarship synchronously in the API request (fits the
//     routing Lambda's budget for a single item). Used TODAY by POST /scholarships/:id/hydrate, so
//     the status leaves 'pending' and reaches a terminal complete/partial/failed immediately.
//   • makeSqsEnqueuer      — enqueue to the hydration queue (HYDRATION_QUEUE_URL) for the async
//     worker. Used by bulk-add (many items would blow a single request's budget). @aws-sdk/client-sqs
//     is on dev; the worker actually draining the queue still waits on the foundational worker-glob
//     (build-lambda must glob module hydration.manifest.ts — escalated on the checkpoint).
//   • makeWorkerHandler    — the SQS worker-side handler, registered via hydration.manifest.ts once
//     that glob lands. Same core, triggered async.
//
// hydrateScholarship merges via `mergePreservingUserEdits` so human-edited fields (userEdited[]) are
// never clobbered, and hydrationStatus/lastDataRefresh reflect the outcome.

import type { Data, Scholarship } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { makeBedrockHydrator, type Hydrator } from './ai.js';

/** SQS message `type` discriminator for a single-scholarship hydration job. */
export const HYDRATION_TYPE = 'scholarship-hydrate';

export interface ScholarshipHydrationMessage {
  type: typeof HYDRATION_TYPE;
  scholarshipId: string;
  tenantId: string;
  studentId: string;
}

export function buildHydrationMessage(scholarshipId: string): ScholarshipHydrationMessage {
  return { type: HYDRATION_TYPE, scholarshipId, tenantId: currentTenantId(), studentId: currentStudentId() };
}

/** Hydrate one scholarship: fetch → AI patch → merge (preserving user edits). Returns the updated
 *  record, or null if it's gone. */
export async function hydrateScholarship(
  getData: () => Data,
  hydrator: Hydrator,
  scholarshipId: string,
): Promise<Scholarship | null> {
  const data = getData();
  const existing = await data.scholarships.get(scholarshipId);
  if (!existing) return null;
  const patch = await hydrator({ name: existing.name, provider: existing.provider });
  return data.scholarships.mergePreservingUserEdits(scholarshipId, patch);
}

/** Inline dispatcher — hydrate now, within the request. Returns the updated record (or null). */
export type InlineDispatcher = (scholarshipId: string) => Promise<Scholarship | null>;
export function makeInlineDispatcher(getData: () => Data, hydrator: Hydrator = makeBedrockHydrator()): InlineDispatcher {
  return (scholarshipId) => hydrateScholarship(getData, hydrator, scholarshipId);
}

/** SQS worker-side handler for the shared `hydrationRegistry` (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  hydrator: Hydrator = makeBedrockHydrator(),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<ScholarshipHydrationMessage>;
    if (typeof msg.scholarshipId !== 'string' || !msg.scholarshipId) return;
    await hydrateScholarship(getData, hydrator, msg.scholarshipId);
  };
}

// --- Async enqueue (bulk) -------------------------------------------------------------------------

/** Minimal structural type of the SQS client (just `send`) — keeps tests injectable. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface HydrationEnqueuer {
  enqueue(scholarshipId: string): Promise<void>;
}

export interface EnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
}

/**
 * SQS-backed enqueuer for bulk hydration. Sends one `scholarship-hydrate` message per scholarship to
 * HYDRATION_QUEUE_URL. Throws if the queue isn't configured or the send fails — bulk-add treats this
 * as best-effort (the record is already saved). The client is constructed lazily so importing this
 * never constructs an AWS client.
 */
export function makeSqsEnqueuer(options: EnqueuerOptions = {}): HydrationEnqueuer {
  let cached: SqsSender | undefined = options.client;
  return {
    async enqueue(scholarshipId) {
      const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
      if (!queueUrl) throw new Error('HYDRATION_QUEUE_URL is not set');
      if (!cached) {
        const { SQSClient } = await import('@aws-sdk/client-sqs');
        cached = new SQSClient({}) as unknown as SqsSender;
      }
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      await cached.send(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(buildHydrationMessage(scholarshipId)) }),
      );
    },
  };
}

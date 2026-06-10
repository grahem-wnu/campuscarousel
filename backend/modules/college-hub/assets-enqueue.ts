// SQS enqueuer for the async campus-imagery / logo fetch. Mirrors enqueue.ts (text hydration) but
// targets the dedicated assets queue (ASSETS_QUEUE_URL) so image fetches run on their own worker,
// parallel to and independent of the ~140s Bedrock hydration. Imagery is best-effort: if no queue is
// configured (or the send fails) the enqueue is a silent no-op — the card simply shows today's
// layout — rather than blocking the request the way hydration's inline fallback does.

import type { Data } from '../../shared/data/index.js';
import { currentTenantId } from '../../shared/tenant/index.js';
import type { SqsSender } from './enqueue.js';
import { ASSETS_TYPE } from './assets.js';

/** Triggers an asset fetch for one college (enqueue to the assets worker). */
export type AssetsDispatcher = (collegeId: string) => Promise<void>;

export interface AssetsEnqueuerOptions {
  /** Queue URL; defaults to `process.env.ASSETS_QUEUE_URL` (injected by CDK from the AsyncStack). */
  queueUrl?: string;
  /** Injectable client (tests); defaults to a real `SQSClient`. */
  client?: SqsSender;
}

/** A dispatcher that enqueues a `college-assets` job for the SQS assets worker. */
export function makeAssetsEnqueuer(_getData: () => Data, options: AssetsEnqueuerOptions = {}): AssetsDispatcher {
  return async (collegeId) => {
    const queueUrl = options.queueUrl ?? process.env.ASSETS_QUEUE_URL;
    if (!queueUrl) return; // no queue configured — imagery is best-effort, so this is a no-op.
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ type: ASSETS_TYPE, collegeId, tenantId: currentTenantId() }),
        }),
      );
    } catch {
      // Best-effort: a failed enqueue must never break create/hydrate. The card falls back gracefully.
    }
  };
}

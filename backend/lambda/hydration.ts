// Lambda entry for the SQS hydration worker (AsyncStack). Consumes one message at a time
// (batchSize 1, reportBatchItemFailures) and dispatches it to a hydration handler keyed by the
// message `type`. The registry is intentionally empty for now — real college/scholarship
// hydration handlers register here when those modules land. Until then this is a real, deployed
// drain: it parses each record, logs unknown types, and reports genuine failures so they retry
// and ultimately land in the DLQ. CDK ships this as `index.handler` via
// `Code.fromAsset(backend/dist/hydration)`.

/** Minimal structural SQS event/response shapes (typed locally to avoid an aws-lambda types dep). */
interface SqsRecord {
  messageId: string;
  body: string;
}
interface SqsEvent {
  Records?: SqsRecord[];
}
interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

/** A hydration handler processes one decoded message payload. */
export type HydrationHandler = (payload: unknown) => Promise<void>;

/**
 * Hydration registry, keyed by message `type`. Empty until the college/scholarship modules
 * register their handlers. Exported so those modules (and tests) can populate it.
 */
export const hydrationRegistry: Record<string, HydrationHandler> = {};

export const handler = async (event: SqsEvent): Promise<SqsBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      const message = JSON.parse(record.body) as { type?: string };
      const type = typeof message?.type === 'string' ? message.type : undefined;
      const dispatch = type ? hydrationRegistry[type] : undefined;
      if (!dispatch) {
        // No handler registered yet — drain without failing (nothing produces these messages
        // until the hydration modules ship). Logged so an unexpected producer is visible.
        console.log('hydration: no handler for message type', type ?? '(none)', '— draining');
        continue;
      }
      await dispatch(message);
    } catch (err) {
      console.error('hydration: record failed', record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

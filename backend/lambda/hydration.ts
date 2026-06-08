// Lambda entry for the SQS hydration worker (AsyncStack). Consumes one message at a time
// (batchSize 1, reportBatchItemFailures) and dispatches it to a hydration handler keyed by the
// message `type`. The registry is assembled at module load from the generated hydration barrel —
// each hydrating module ships `hydration.manifest.ts` (`export const hydration = { type, handler }`)
// which `build-lambda.mjs` statically imports into backend/lambda/generated/hydration-manifests.ts.
// Unknown types drain (logged); genuine failures report so they retry and ultimately hit the DLQ.
// CDK ships this as `index.handler` via `Code.fromAsset(backend/dist/hydration)`.

import { hydrationRegistrations } from './generated/hydration-manifests.js';

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

/** One module's hydration registration: a message `type` and the handler that processes it. */
export interface HydrationRegistration {
  type: string;
  handler: HydrationHandler;
}

/**
 * Build the `type -> handler` registry from the module registrations, failing loudly (at cold
 * start) on a duplicate `type` across modules — the worker-side mirror of the router's
 * `collectRoutes`/`check:routes` duplicate guard. Exported for unit testing.
 */
export function buildRegistry(
  registrations: readonly HydrationRegistration[],
): Record<string, HydrationHandler> {
  const registry: Record<string, HydrationHandler> = {};
  for (const reg of registrations) {
    if (registry[reg.type]) {
      throw new Error(`Duplicate hydration type across manifests: ${reg.type}`);
    }
    registry[reg.type] = reg.handler;
  }
  return registry;
}

/**
 * Hydration registry, keyed by message `type`, populated from every module's hydration manifest.
 * Empty only while no module hydrates yet. Exported so tests can inspect what registered.
 */
export const hydrationRegistry: Record<string, HydrationHandler> = buildRegistry(
  hydrationRegistrations,
);

/**
 * Build the SQS worker handler over a given registry. One message at a time (batchSize 1);
 * a message whose `type` has no registered handler drains (logged); a handler that throws is
 * reported as a batch item failure so SQS retries it and it ultimately lands in the DLQ.
 * Parameterized by registry so it is unit-testable; production binds the assembled registry.
 */
export function makeHandler(registry: Record<string, HydrationHandler>) {
  return async (event: SqsEvent): Promise<SqsBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const record of event.Records ?? []) {
      try {
        const message = JSON.parse(record.body) as { type?: string };
        const type = typeof message?.type === 'string' ? message.type : undefined;
        const dispatch = type ? registry[type] : undefined;
        if (!dispatch) {
          // No handler for this type — drain without failing (logged so an unexpected producer
          // is visible). Until a module ships its hydration.manifest, every message drains here.
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
}

export const handler = makeHandler(hydrationRegistry);

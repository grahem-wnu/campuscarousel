// SQS hydration enqueue for POST /scholarships/:id/hydrate and the hydrate flag on bulk-add.
//
// The routing Lambda has HYDRATION_QUEUE_URL + SQS send permission (infra/lib/api-stack.ts), but
// two foundational pieces are missing (raised on .agent-bus/checkpoints/scholarship-tracker.md):
//   1. @aws-sdk/client-sqs is not in the backend bundle, so the routing Lambda can't actually send.
//   2. backend/lambda/hydration.ts has no module-registration glob, so a 'scholarship-hydrate'
//      worker handler can't be wired in (the registry is hardcoded-empty).
// Until both land, the enqueuer is injected and returns a clean 503. The message shape + builder are
// pure + tested so the worker side (and the real enqueuer) drop in cleanly later.

import { ApiError } from '../../shared/api/index.js';

/** The hydration message a scholarship enqueues. `type` keys the worker's hydration registry. */
export interface ScholarshipHydrationMessage {
  type: 'scholarship-hydrate';
  scholarshipId: string;
  /** What to research/refresh — the name (and provider) anchor the web search. */
  name: string;
  provider?: string;
}

export interface HydrationEnqueuer {
  enqueue(message: ScholarshipHydrationMessage): Promise<void>;
}

/** Build the hydration message for a scholarship (pure; the worker consumes this shape). */
export function buildHydrationMessage(s: {
  scholarshipId: string;
  name: string;
  provider?: string;
}): ScholarshipHydrationMessage {
  const message: ScholarshipHydrationMessage = {
    type: 'scholarship-hydrate',
    scholarshipId: s.scholarshipId,
    name: s.name,
  };
  if (s.provider) message.provider = s.provider;
  return message;
}

/**
 * Placeholder until the async hydration infra exists (SQS client in the bundle + a registered
 * worker handler). Returns a clean 503. Swapped for a real SQS-backed enqueuer once they land.
 */
export const unavailableEnqueuer: HydrationEnqueuer = {
  enqueue() {
    return Promise.reject(
      new ApiError(
        503,
        'unavailable',
        'AI hydration is not yet enabled (pending async hydration infra). Scholarship data can still be edited manually.',
      ),
    );
  },
};

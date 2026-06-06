// Worker-side hydration registration for Scholarship Tracker.
//
// The SQS worker entry (backend/lambda/hydration.ts) keeps `hydrationRegistry: Record<type,
// HydrationHandler>` and dispatches by message `type`. The foundational hydration-bundle build
// (pending — escalated on .agent-bus/checkpoints/scholarship-tracker.md) will glob each module's
// `hydration.manifest.ts` and merge its handler map into that registry, mirroring the routes barrel.
//
// CONTRACT for that glob (matches backend/modules/college-hub/hydration.manifest.ts): this module
// exports `hydrationHandlers: Record<string, HydrationHandler>` (message `type` → handler), so the
// build can `Object.assign(hydrationRegistry, ...hydrationHandlers)` and fail loudly on a duplicate
// `type`. `hydration` ({ type, handler }) is a convenience alias. Both activate with zero handler
// changes once the glob lands; until then nothing imports this into the worker bundle.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { HYDRATION_TYPE, makeWorkerHandler } from './hydration.js';

/** A worker hydration handler: decode one SQS message payload and apply it. */
export type HydrationHandler = (payload: unknown) => Promise<void>;

let cached: Data | undefined;
const handler: HydrationHandler = makeWorkerHandler((): Data => (cached ??= dataFromEnv()));

/** Message `type` → handler. The hydration-bundle build merges this into the worker registry. */
export const hydrationHandlers: Record<string, HydrationHandler> = {
  [HYDRATION_TYPE]: handler,
};

/** Convenience single-handler alias, in case the glob prefers a { type, handler } shape. */
export const hydration = { type: HYDRATION_TYPE, handler };

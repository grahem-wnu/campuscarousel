// Hydration orchestration for College Hub. The actual AI work lives in ai.ts (`Hydrator`); this file
// wires it to the data layer and exposes two trigger paths behind ONE seam:
//
//   • makeInlineDispatcher — runs hydration synchronously in the API request (fits the routing
//     Lambda's 30s budget for a single college). This is what the handlers use TODAY.
//   • makeWorkerHandler    — the SQS worker-side handler, registered into the shared
//     `hydrationRegistry` once the worker bundle globs module hydration handlers (escalated on
//     .agent-bus/checkpoints/college-hub.md). Same core, triggered async.
//
// Both call `hydrateCollege`, which merges via `mergePreservingUserEdits` so human-edited fields
// (`userEdited[]`) are never clobbered, and `hydrationStatus`/`lastDataRefresh` reflect the outcome.

import type { Data } from '../../shared/data/index.js';
import { makeBedrockHydrator, type Hydrator } from './ai.js';

/** SQS message `type` discriminator for a single-college hydration job. */
export const HYDRATION_TYPE = 'college-hydrate';

export interface CollegeHydrationMessage {
  type: typeof HYDRATION_TYPE;
  collegeId: string;
}

/** Hydrate one college: fetch → AI patch → merge (preserving user edits). No-op if it's gone. */
export async function hydrateCollege(
  getData: () => Data,
  hydrator: Hydrator,
  collegeId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  const patch = await hydrator({ name: college.name, state: college.state });
  await data.colleges.mergePreservingUserEdits(collegeId, patch);
}

/** One seam for "make this college hydrate". Production = inline; future = SQS enqueue. */
export type HydrationDispatcher = (collegeId: string) => Promise<void>;

/** Inline dispatcher — hydrate now, within the request. Used until the SQS worker path is wired. */
export function makeInlineDispatcher(
  getData: () => Data,
  hydrator: Hydrator = makeBedrockHydrator(),
): HydrationDispatcher {
  return (collegeId) => hydrateCollege(getData, hydrator, collegeId);
}

/** SQS worker-side handler for the shared `hydrationRegistry` (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  hydrator: Hydrator = makeBedrockHydrator(),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CollegeHydrationMessage>;
    if (typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    await hydrateCollege(getData, hydrator, msg.collegeId);
  };
}

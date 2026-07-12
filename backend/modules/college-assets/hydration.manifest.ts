// Worker-side registration for the College Hub campus-imagery / logo fetch.
//
// The hydration-bundle build (backend/scripts/build-lambda.mjs) globs every module's
// `hydration.manifest.ts` into the shared worker registry, keyed by message `type`. This is its own
// module dir (not college-hub's) only because a module ships exactly one hydration.manifest; the
// actual asset logic lives in ../college-hub/assets.ts, co-located with its enqueuer. When an SQS
// message with `type: 'college-assets'` arrives (on the dedicated AssetsQueue → AssetsWorker), the
// worker invokes this handler. The handler resolves the data client lazily, like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { ASSETS_TYPE, makeAssetsWorker } from '../college-hub/assets.js';

let cached: Data | undefined;
const handler = makeAssetsWorker((): Data => (cached ??= dataFromEnv()));

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: ASSETS_TYPE, handler };

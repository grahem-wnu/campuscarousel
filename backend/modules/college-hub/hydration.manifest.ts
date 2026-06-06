// Worker-side hydration registration for College Hub (forward-looking).
//
// The SQS worker entry (backend/lambda/hydration.ts) keeps a registry keyed by message `type`, but
// its build currently only globs routes.manifest.ts — module hydration handlers aren't yet bundled
// into the worker (escalated on .agent-bus/checkpoints/college-hub.md). This file exports the
// registration in the shape the worker glob is expected to consume:
//
//   export const hydration = { type, handler };
//
// Once the build imports each module's hydration.manifest into lambda/hydration.ts (mirroring the
// routes glob), this activates with zero handler/test changes. The handler resolves the data client
// lazily, exactly like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { HYDRATION_TYPE, makeWorkerHandler } from './hydration.js';

let cached: Data | undefined;
const handler = makeWorkerHandler((): Data => (cached ??= dataFromEnv()));

export const hydration = { type: HYDRATION_TYPE, handler };

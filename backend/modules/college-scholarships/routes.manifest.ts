// Route manifest for College Scholarship Research. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these — no shared registry to edit. The
// method+path are inline string literals so the `check:routes` guard (a static parse) can spot a
// cross-module duplicate; `buildRoutes` in handlers.ts holds the same table for tests, and
// manifest.test.ts asserts the two never drift.
//
// The data client and both dispatchers resolve lazily on first use, so importing this manifest never
// constructs an AWS client or requires TABLE_NAME / BEDROCK_MODEL_ID / a queue url. Both AI jobs are
// web-grounded and run ASYNC on the 300s SQS worker (see jobs.ts); the enqueuers fall back to inline
// execution when no queue is configured.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeSqsResearchEnqueuer, makeSqsSearchEnqueuer } from './jobs.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());

const handlers = makeHandlers({
  getData,
  searchDispatch: makeSqsSearchEnqueuer(getData),
  researchDispatch: makeSqsResearchEnqueuer(getData),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/colleges/:id/scholarships', handler: handlers.list },
  { method: 'POST', path: '/colleges/:id/scholarships/search', handler: handlers.search },
  { method: 'POST', path: '/colleges/:id/scholarships/research', handler: handlers.researchBatch },
  { method: 'GET', path: '/colleges/:id/scholarships/:scholarshipId', handler: handlers.detail },
  { method: 'POST', path: '/colleges/:id/scholarships/:scholarshipId/research', handler: handlers.research },
  { method: 'DELETE', path: '/colleges/:id/scholarships/:scholarshipId', handler: handlers.remove },
];

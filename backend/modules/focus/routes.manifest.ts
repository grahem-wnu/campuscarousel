// Route manifest for Focus (the major-pack page). The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. Method+path are inline literals so the
// `check:routes` guard can detect cross-module duplicates; `buildRoutes` in handlers.ts holds the same
// table for tests. Data client resolved lazily (first request) so importing never needs TABLE_NAME.
// The overview dispatcher enqueues onto the shared hydration queue (HYDRATION_QUEUE_URL), falling back
// to an inline run when no queue is configured.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeSqsOverviewEnqueuer } from './overview.js';
import { makeSqsCareerEnqueuer } from './careerpath.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handlers = makeHandlers({
  getData,
  overviewDispatch: makeSqsOverviewEnqueuer(getData),
  careerDispatch: makeSqsCareerEnqueuer(getData),
});

export const routes: RouteDef[] = [
  { method: 'POST', path: '/focus/overview', handler: handlers.refresh },
  { method: 'POST', path: '/focus/career-path', handler: handlers.refreshCareer },
  { method: 'GET', path: '/focus', handler: handlers.get },
];

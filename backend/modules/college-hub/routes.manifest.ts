// Route manifest for College Hub. The shared router globs backend/modules/*/routes.manifest.ts and
// registers these. The method+path are inline string literals so the `check:routes` guard can detect
// cross-module duplicates; `buildRoutes` in handlers.ts holds the same table for tests, and
// manifest.test.ts asserts they never drift.
//
// Data client resolved lazily (first request) so importing this manifest never needs TABLE_NAME.
// Discovery defaults to the Bedrock-backed implementation (model id from BEDROCK_MODEL_ID).
// Hydration is dispatched ASYNC via SQS (`makeSqsEnqueuer`): the API enqueues a `college-hydrate`
// job (queue url from HYDRATION_QUEUE_URL) and returns immediately; the SQS worker (which now globs
// this module's hydration.manifest) does the Bedrock work; the frontend polls hydrationStatus. The
// enqueuer falls back to inline hydration if the queue is unavailable.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';
import { makeSqsEnqueuer } from './enqueue.js';
import { makeSqsDiscoverEnqueuer } from './discover.js';
import { makeAssetsEnqueuer } from './assets-enqueue.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handlers = makeHandlers({
  getData,
  dispatch: makeSqsEnqueuer(getData),
  discoverDispatch: makeSqsDiscoverEnqueuer(getData),
  assetsDispatch: makeAssetsEnqueuer(getData),
});

export const routes: RouteDef[] = [
  { method: 'GET', path: '/colleges', handler: handlers.list },
  { method: 'POST', path: '/colleges', handler: handlers.create },
  { method: 'POST', path: '/colleges/discover', handler: handlers.discover },
  { method: 'GET', path: '/colleges/discover/:jobId', handler: handlers.discoverStatus },
  { method: 'POST', path: '/colleges/hydrate-all', handler: handlers.hydrateAll },
  { method: 'POST', path: '/colleges/assets-backfill', handler: handlers.assetsBackfill },
  { method: 'POST', path: '/colleges/bulk-add', handler: handlers.bulkAdd },
  { method: 'GET', path: '/colleges/:id', handler: handlers.detail },
  { method: 'PUT', path: '/colleges/:id', handler: handlers.update },
  { method: 'DELETE', path: '/colleges/:id', handler: handlers.remove },
  { method: 'PATCH', path: '/colleges/:id/top-pick', handler: handlers.topPick },
  { method: 'POST', path: '/colleges/:id/hydrate', handler: handlers.hydrate },
  { method: 'GET', path: '/colleges/:id/notes', handler: handlers.listNotes },
  { method: 'POST', path: '/colleges/:id/notes', handler: handlers.addNote },
  { method: 'GET', path: '/colleges/:id/checklist', handler: handlers.getChecklist },
  { method: 'PUT', path: '/colleges/:id/checklist', handler: handlers.putChecklist },
];

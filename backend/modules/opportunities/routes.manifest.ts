// Route manifest for Opportunity Finder (v2.1 Module 18). Discovery is dispatched ASYNC via SQS
// (makeSqsDiscoverEnqueuer): the API enqueues an `opportunity-discover` job (queue from
// HYDRATION_QUEUE_URL) and returns 202; the SQS worker (which globs this module's hydration.manifest)
// runs the web-grounded search; the frontend polls. Falls back to inline if the queue is unavailable.
// Data client resolved lazily so importing never needs TABLE_NAME.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeSqsDiscoverEnqueuer } from './discover.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const h = makeHandlers({ getData, discoverDispatch: makeSqsDiscoverEnqueuer(getData) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/opportunities', handler: h.list },
  { method: 'POST', path: '/opportunities/discover', handler: h.discover },
  { method: 'GET', path: '/opportunities/discover/:jobId', handler: h.discoverStatus },
  { method: 'POST', path: '/opportunities/bulk-add', handler: h.bulkAdd },
  { method: 'POST', path: '/opportunities', handler: h.create },
  { method: 'GET', path: '/opportunities/:id', handler: h.detail },
  { method: 'PUT', path: '/opportunities/:id', handler: h.update },
  { method: 'DELETE', path: '/opportunities/:id', handler: h.remove },
];

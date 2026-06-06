// Route manifest for Interview Prep. The shared router globs backend/modules/*/routes.manifest.ts.
// method+path are inline string literals for the `check:routes` guard; buildRoutes() in handlers.ts
// holds the same table for tests. Data client resolved lazily so importing never needs TABLE_NAME.
// AI question/feedback generators default to the Bedrock-backed implementations (model id from
// BEDROCK_MODEL_ID), each with a deterministic curated fallback.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/interviews/questions', handler: handlers.listQuestions },
  { method: 'POST', path: '/interviews/questions', handler: handlers.addQuestion },
  { method: 'POST', path: '/interviews/mock', handler: handlers.mock },
  { method: 'POST', path: '/interviews/mock/:sessionId/answer', handler: handlers.answer },
  { method: 'GET', path: '/interviews', handler: handlers.list },
  { method: 'POST', path: '/interviews', handler: handlers.create },
  { method: 'GET', path: '/interviews/:id', handler: handlers.detail },
  { method: 'PUT', path: '/interviews/:id', handler: handlers.update },
  { method: 'DELETE', path: '/interviews/:id', handler: handlers.remove },
];

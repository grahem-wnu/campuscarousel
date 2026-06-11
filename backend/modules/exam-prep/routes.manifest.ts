// Route manifest for Exam Prep. The shared router globs backend/modules/*/routes.manifest.ts and
// registers these. The method+path are inline string literals so the `check:routes` guard can detect
// cross-module duplicates; `buildRoutes` in handlers.ts holds the same table for tests.
//
// Data client resolved lazily (first request) so importing this manifest never needs TABLE_NAME. The
// planner/analyzer default to the Bedrock-backed implementations (model id from BEDROCK_MODEL_ID),
// each with a deterministic curated fallback.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/exams/progress', handler: handlers.progress },
  { method: 'POST', path: '/exams/study-plan', handler: handlers.studyPlan },
  { method: 'POST', path: '/exams/analyze', handler: handlers.analyze },
  { method: 'GET', path: '/exams', handler: handlers.list },
  { method: 'POST', path: '/exams', handler: handlers.create },
  { method: 'GET', path: '/exams/:id', handler: handlers.detail },
  { method: 'PUT', path: '/exams/:id', handler: handlers.update },
  { method: 'DELETE', path: '/exams/:id', handler: handlers.remove },
];

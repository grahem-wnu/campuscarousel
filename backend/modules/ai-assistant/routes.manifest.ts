// Route manifest for the AI Assistant module. The shared router globs
// backend/modules/*/routes.manifest.ts and registers these. No shared registry to edit.
//
// The method+path are inline string literals so the `check:routes` guard (which statically parses
// this file) can detect cross-module duplicates. The handler bindings come from `makeHandlers`;
// `buildRoutes` in handlers.ts holds the same table for tests, and manifest.test.ts asserts the two
// never drift apart.
//
// The data client is resolved lazily (first request). The assistant is likewise injected: the
// production binding (bedrock.ts) calls Bedrock when BEDROCK_MODEL_ID is set, and degrades to a
// clean 503 locally/unconfigured.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { bedrockAssistant } from './bedrock.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const handlers = makeHandlers(
  (): Data => (cached ??= dataFromEnv()),
  () => bedrockAssistant,
);

export const routes: RouteDef[] = [
  { method: 'POST', path: '/ai/chat', handler: handlers.chat },
  { method: 'GET', path: '/ai/conversations', handler: handlers.listConversations },
  { method: 'GET', path: '/ai/conversations/:id', handler: handlers.getConversation },
];

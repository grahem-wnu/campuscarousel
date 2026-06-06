// Lambda entry for the HTTP API ($default route). Assembles every module's routes from the
// generated manifest barrel and builds the shared router. Identity resolution, role guards, and
// privacy/visibility all live inside the router and the module handlers — this entry only wires
// them together. CDK ships this as `index.handler` via `Code.fromAsset(backend/dist/api)`.

import { collectRoutes, createLambdaHandler } from '../shared/api/index.js';
import { manifests } from './generated/manifests.js';

// `collectRoutes` flattens the per-module manifests and fails loudly on a duplicate method+path
// (the runtime backstop for the same invariant `check:routes` enforces statically at build time).
export const handler = createLambdaHandler(collectRoutes(manifests));

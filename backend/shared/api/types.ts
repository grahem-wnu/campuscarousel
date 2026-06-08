// Shared API & routing types (FROZEN CONTRACT — specs/foundational/api.md).
//
// Modules ship a `routes.manifest.ts` exporting `routes: RouteDef[]`; the router globs all
// manifests and dispatches by method+path. Handlers receive the context below and return a
// plain `{ status, body }` — they never touch the raw Lambda event or build HTTP responses.

import type { Requester, Role } from '../auth/index.js';

/** HTTP methods the router understands. Compared case-insensitively. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Error codes in the standard envelope, each mapped to an HTTP status by the router. */
export type ErrorCode =
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'validation' // 422
  | 'conflict' // 409
  | 'internal'; // 500

/** The standard error body: `{ "error": { "code", "message" } }`. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode | string;
    message: string;
  };
}

/**
 * Context passed to every handler. Identity is resolved from the validated JWT (never the
 * client); `params` are path parameters; `query` is the parsed query string; `body` is the
 * parsed JSON request body (validate it with the zod helpers before use).
 */
export interface HandlerContext {
  requester: Requester;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

/** What a handler returns: an HTTP status and a JSON-serializable body. */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/** A single endpoint handler. */
export type Handler = (ctx: HandlerContext) => Promise<HandlerResult>;

/**
 * One route registration. `path` uses `:param` or `{param}` segments for path parameters
 * (e.g. `/colleges/:id`). Optional `roles` gates the endpoint to specific roles before the
 * handler runs (the router calls `requireRole` for you); omit for any authenticated caller.
 * Keep `method` and `path` as string literals so the `check:routes` guard can protect them.
 */
export interface RouteDef {
  method: Method;
  path: string;
  handler: Handler;
  roles?: Role[];
}

/** Shape a module manifest must export. */
export interface RouteManifest {
  routes?: RouteDef[];
}

export type { Requester, Role } from '../auth/index.js';

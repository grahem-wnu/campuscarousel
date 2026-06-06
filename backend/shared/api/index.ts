// Public surface of the shared API & routing contract. Module handlers + route manifests import
// from `backend/shared/api` (this index); the Lambda entry uses `createLambdaHandler` + `loadRoutes`.

export type {
  Method,
  ErrorCode,
  ErrorEnvelope,
  HandlerContext,
  HandlerResult,
  Handler,
  RouteDef,
  RouteManifest,
  Requester,
  Role,
} from './types.js';

export { ApiError, Errors, isApiErrorLike } from './errors.js';
export { validate, validateBody, validateQuery, validateParams, z } from './validate.js';
export type { ZodType } from './validate.js';
export { json, errorEnvelope, responseForError } from './respond.js';
export { createRouter, createLambdaHandler } from './router.js';
export { collectRoutes, loadManifests, loadRoutes } from './manifest.js';
export type { ApiEvent, ApiResponse, LambdaHandler } from './event.js';

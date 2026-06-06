// API errors. A handler (or the helpers it calls) throws an `ApiError`; the router translates it
// into the standard envelope `{ "error": { "code", "message" } }` with the matching HTTP status.
// Auth errors (`AuthError` from ../auth) already carry `code`+`status` and are handled the same
// way; the data layer's `NotFoundError` (name-only) is mapped to 404 by the router.

import type { ErrorCode } from './types.js';

/** An error that maps directly to an API error-envelope response. */
export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;

  constructor(status: number, code: ErrorCode | string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Duck-typed guard for anything that already carries an envelope `code` + HTTP `status` */
export function isApiErrorLike(e: unknown): e is { status: number; code: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

/** Convenience constructors for the standard codes. Handlers throw these. */
export const Errors = {
  /** 422 — input failed validation. */
  validation: (message = 'Validation failed'): ApiError => new ApiError(422, 'validation', message),
  /** 404 — resource does not exist. */
  notFound: (message = 'Not found'): ApiError => new ApiError(404, 'not_found', message),
  /** 409 — conflicting state (duplicate, version mismatch). */
  conflict: (message = 'Conflict'): ApiError => new ApiError(409, 'conflict', message),
  /** 403 — authenticated but not allowed. */
  forbidden: (message = 'Forbidden'): ApiError => new ApiError(403, 'forbidden', message),
  /** 401 — no/invalid identity. */
  unauthorized: (message = 'Unauthorized'): ApiError => new ApiError(401, 'unauthorized', message),
  /** 500 — unexpected server error. */
  internal: (message = 'Internal server error'): ApiError => new ApiError(500, 'internal', message),
} as const;

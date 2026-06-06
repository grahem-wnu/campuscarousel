// Response building + error translation. Successful handler results and thrown errors both end
// up here so every response is JSON with the same shape (and errors use the standard envelope).

import { isApiErrorLike } from './errors.js';
import type { ApiResponse } from './event.js';
import type { ErrorCode, ErrorEnvelope } from './types.js';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/** Build a JSON response. A 204 carries no body. */
export function json(status: number, body: unknown): ApiResponse {
  if (status === 204 || body === undefined) {
    return { statusCode: status, headers: { ...JSON_HEADERS }, body: '' };
  }
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body) };
}

/** Build a standard error-envelope body. */
export function errorEnvelope(code: ErrorCode | string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

/**
 * Translate any thrown value into an envelope response:
 *  - errors carrying `status` + `code` (ApiError, AuthError) → that status/code/message
 *  - the data layer's `NotFoundError` (name only) → 404 not_found
 *  - anything else → 500 internal (generic message; the real error is logged, never leaked)
 */
export function responseForError(err: unknown): ApiResponse {
  if (isApiErrorLike(err)) {
    return json(err.status, errorEnvelope(err.code, err.message));
  }
  if (err instanceof Error && err.name === 'NotFoundError') {
    return json(404, errorEnvelope('not_found', err.message));
  }
  // Unknown / unexpected: log for diagnosis, return a generic 500.
  console.error('Unhandled error in API handler:', err);
  return json(500, errorEnvelope('internal', 'Internal server error'));
}

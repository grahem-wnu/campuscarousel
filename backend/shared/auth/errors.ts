// Typed auth errors. Each carries the API error-envelope `code` plus the HTTP `status`
// (see specs/foundational/api.md), so the router can translate a thrown auth error straight into
// the standard envelope `{ "error": { "code", "message" } }`.

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

/** 401 — no/invalid identity could be derived from the request. */
export class UnauthorizedError extends AuthError {
  constructor(message = 'Unauthorized') {
    super('unauthorized', 401, message);
  }
}

/** 403 — the caller is authenticated but not allowed to perform/read this. */
export class ForbiddenError extends AuthError {
  constructor(message = 'Forbidden') {
    super('forbidden', 403, message);
  }
}

/**
 * API contract types shared by the frontend. Mirrors the backend error envelope
 * defined in `specs/foundational/api.md` so the client can parse failures uniformly.
 */

/** Error codes the backend returns (api.md "Conventions"). */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "internal";

/** Standard error envelope: `{ "error": { "code", "message" } }`. */
export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode | string;
    message: string;
  };
}

/** HTTP status that maps to each error code (for synthesizing when the body is absent). */
export const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation",
  500: "internal",
};

/**
 * Thrown by the API client on any non-2xx response. Carries the parsed envelope
 * code + message and the HTTP status, so callers can branch (e.g. show a 403 as
 * "you don't have access" vs a 422 field error).
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;

  constructor(status: number, code: ApiErrorCode | string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True for auth failures the shell should react to (e.g. bounce to login). */
  get isAuth(): boolean {
    return this.code === "unauthorized" || this.status === 401;
  }
}

/** Query params accepted by request helpers (undefined/null values are dropped). */
export type Query = Record<string, string | number | boolean | undefined | null>;

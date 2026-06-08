// zod validation helpers. Every handler validates input before touching the data layer
// (specs/foundational/api.md); a validation failure becomes a 422 envelope automatically.

import { z, type ZodType } from 'zod';
import { Errors } from './errors.js';
import type { HandlerContext } from './types.js';

/** Format zod issues into one human-readable message (path: reason; …). */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Validate `data` against `schema`, returning the typed value or throwing a 422 `ApiError`.
 * The thrown error's message lists the failing fields.
 */
export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Errors.validation(formatIssues(result.error));
  }
  return result.data;
}

/** Validate the request body (`ctx.body`). */
export function validateBody<T>(schema: ZodType<T>, ctx: HandlerContext): T {
  return validate(schema, ctx.body);
}

/** Validate the query string (`ctx.query`). Coerce types in the schema as needed. */
export function validateQuery<T>(schema: ZodType<T>, ctx: HandlerContext): T {
  return validate(schema, ctx.query);
}

/** Validate path parameters (`ctx.params`). */
export function validateParams<T>(schema: ZodType<T>, ctx: HandlerContext): T {
  return validate(schema, ctx.params);
}

export { z } from 'zod';
export type { ZodType } from 'zod';

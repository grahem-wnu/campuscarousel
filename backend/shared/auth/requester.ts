// Identity resolution + role guards. Identity always comes from the validated JWT claims that the
// API Gateway Cognito JWT authorizer has already verified — never from client-supplied fields.

import type { Requester, Role } from './types.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';

const ROLES: readonly Role[] = ['admin', 'parent', 'student'];

/**
 * Minimal shape of an API Gateway HTTP API (v2) event carrying a Cognito JWT authorizer.
 * Typed locally so this contract has zero runtime/type dependencies and never needs an edit to
 * the shared backend `package.json`.
 */
export interface JwtAuthorizedEvent {
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Resolve the caller's identity from the validated JWT claims. The username comes from
 * `cognito:username` (ID token) with a fallback to `username` (access token); the role comes from
 * the `custom:role` claim. Throws `UnauthorizedError` (401) if a valid identity can't be derived.
 */
export function getRequester(event: JwtAuthorizedEvent): Requester {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims) {
    throw new UnauthorizedError('Missing JWT authorizer claims');
  }

  const username = asString(claims['cognito:username']) ?? asString(claims['username']);
  if (!username) {
    throw new UnauthorizedError('Missing username claim');
  }

  const role = claims['custom:role'];
  if (!isRole(role)) {
    throw new UnauthorizedError('Missing or invalid role claim');
  }

  // SaaS platform: the tenant (family) the caller belongs to, and whether they're a platform admin.
  // Tenant enforcement happens in the router (401 if absent on a tenant route) + the fail-closed data
  // layer; resolved here so it flows through HandlerContext.
  const tenantId = asString(claims['custom:tenantId']);
  const platformAdmin = claims['custom:platformAdmin'] === 'true' || claims['custom:platformAdmin'] === true;

  return { username, role, ...(tenantId ? { tenantId } : {}), ...(platformAdmin ? { platformAdmin } : {}) };
}

/**
 * Build a guard that throws `ForbiddenError` (403) unless the requester holds one of `roles`.
 * Use on role-restricted endpoints, e.g. an admin-only password reset:
 *   `requireRole('admin')(getRequester(event));`
 */
export function requireRole(...roles: Role[]): (requester: Requester) => void {
  return (requester: Requester): void => {
    if (!roles.includes(requester.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(' | ')}`);
    }
  };
}

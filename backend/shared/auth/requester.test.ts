import { describe, it, expect } from 'vitest';
import { getRequester, requireRole, type JwtAuthorizedEvent } from './requester.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';
import type { Requester } from './types.js';

function eventWithClaims(claims: Record<string, unknown>): JwtAuthorizedEvent {
  return { requestContext: { authorizer: { jwt: { claims } } } };
}

describe('getRequester', () => {
  it('reads username from cognito:username and role from custom:role', () => {
    const req = getRequester(
      eventWithClaims({ 'cognito:username': 'keira', 'custom:role': 'student' }),
    );
    expect(req).toEqual<Requester>({ username: 'keira', role: 'student' });
  });

  it('falls back to the `username` claim when cognito:username is absent', () => {
    const req = getRequester(eventWithClaims({ username: 'kate', 'custom:role': 'parent' }));
    expect(req).toEqual<Requester>({ username: 'kate', role: 'parent' });
  });

  it('resolves the tenant claim (SaaS) and platform-admin flag', () => {
    const req = getRequester(
      eventWithClaims({
        'cognito:username': 'keira',
        'custom:role': 'student',
        'custom:tenantId': 'fam1',
        'custom:platformAdmin': 'true',
      }),
    );
    expect(req).toMatchObject({ username: 'keira', role: 'student', tenantId: 'fam1', platformAdmin: true });
  });

  it('omits tenantId/platformAdmin when their claims are absent', () => {
    const req = getRequester(eventWithClaims({ 'cognito:username': 'keira', 'custom:role': 'student' }));
    expect(req.tenantId).toBeUndefined();
    expect(req.platformAdmin).toBeUndefined();
  });

  it('resolves custom:studentId for a student login pinned to a roster entry', () => {
    const req = getRequester(
      eventWithClaims({
        'cognito:username': 'keira',
        'custom:role': 'student',
        'custom:tenantId': 'fam1',
        'custom:studentId': 's1',
      }),
    );
    expect(req).toEqual<Requester>({ username: 'keira', role: 'student', tenantId: 'fam1', studentId: 's1' });
  });

  it('omits studentId when the custom:studentId claim is absent', () => {
    const req = getRequester(eventWithClaims({ 'cognito:username': 'keira', 'custom:role': 'student' }));
    expect(req.studentId).toBeUndefined();
  });

  it('throws Unauthorized when there is no authorizer/claims at all', () => {
    expect(() => getRequester({})).toThrow(UnauthorizedError);
  });

  it('throws Unauthorized when the username claim is missing', () => {
    expect(() => getRequester(eventWithClaims({ 'custom:role': 'student' }))).toThrow(
      UnauthorizedError,
    );
  });

  it('throws Unauthorized when the role claim is missing', () => {
    expect(() => getRequester(eventWithClaims({ 'cognito:username': 'keira' }))).toThrow(
      UnauthorizedError,
    );
  });

  it('throws Unauthorized when the role claim is not a known role', () => {
    expect(() =>
      getRequester(eventWithClaims({ 'cognito:username': 'keira', 'custom:role': 'superuser' })),
    ).toThrow(UnauthorizedError);
  });

  it('the Unauthorized error carries code/status for the API envelope', () => {
    try {
      getRequester({});
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).status).toBe(401);
      expect((err as UnauthorizedError).code).toBe('unauthorized');
    }
  });
});

describe('requireRole', () => {
  const admin: Requester = { username: 'grahem', role: 'admin' };
  const parent: Requester = { username: 'kate', role: 'parent' };

  it('passes when the requester holds an allowed role', () => {
    expect(() => requireRole('admin')(admin)).not.toThrow();
    expect(() => requireRole('admin', 'parent')(parent)).not.toThrow();
  });

  it('throws Forbidden (403) when the requester lacks the role', () => {
    expect(() => requireRole('admin')(parent)).toThrow(ForbiddenError);
    try {
      requireRole('admin')(parent);
    } catch (err) {
      expect((err as ForbiddenError).status).toBe(403);
      expect((err as ForbiddenError).code).toBe('forbidden');
    }
  });
});

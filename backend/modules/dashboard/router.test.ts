// Integration through the real shared router: JWT identity + routing + envelope, as in the Lambda,
// without AWS. The dashboard is read-only; the privacy axis is the auth gate (401) + role in the JWT.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const now = () => new Date('2026-06-06T00:00:00Z');
let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, now })));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });
function event(method: string, path: string, as?: Requester): ApiEvent {
  return { rawPath: path, requestContext: { http: { method, path }, authorizer: as ? { jwt: { claims: claimsFor(as) } } : undefined } };
}
const keira: Requester = { username: 'keira', role: 'student' };
const grahem: Requester = { username: 'grahem', role: 'admin' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('401s unauthenticated; 404s unknown', async () => {
    expect((await dispatch(event('GET', '/dashboard'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', keira))).statusCode).toBe(404);
  });

  it('returns a role-appropriate payload (student vs admin) even when empty', async () => {
    const s = await dispatch(event('GET', '/dashboard', keira));
    expect(s.statusCode).toBe(200);
    expect(parse(s).role).toBe('student');
    expect(parse(s)).toHaveProperty('student');

    const a = await dispatch(event('GET', '/dashboard', grahem));
    expect(parse(a).role).toBe('admin');
    expect(parse(a)).toHaveProperty('family');
  });
});

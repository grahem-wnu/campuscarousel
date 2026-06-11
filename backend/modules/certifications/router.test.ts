// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves the whole pipeline (JWT identity resolution +
// routing + zod + error envelope) the way it runs in the Lambda, without any AWS. Certifications are
// family-visible, so the privacy axis here is just the auth gate (401 without a JWT).

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

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant' });

function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {},
): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: opts.query,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/certifications'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists (family-visible: a parent sees what Keira added)', async () => {
    const created = await dispatch(
      event('POST', '/certifications', { as: keira, body: { name: 'BLS/CPR', status: 'active' } }),
    );
    expect(created.statusCode).toBe(201);
    const asKate = await dispatch(event('GET', '/certifications', { as: kate }));
    expect((parse(asKate).certifications as unknown[])).toHaveLength(1);
  });

  it('routes /certifications/expiring to the expiring handler (static beats :id)', async () => {
    await dispatch(
      event('POST', '/certifications', {
        as: keira,
        body: { name: 'Near', status: 'active', expirationDate: '2026-07-01' },
      }),
    );
    const res = await dispatch(event('GET', '/certifications/expiring', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).days).toBe(90);
    expect((parse(res).certifications as unknown[])).toHaveLength(1);
  });

  it('routes /certifications/suggest and returns curated baseline suggestions', async () => {
    const res = await dispatch(
      event('POST', '/certifications/suggest', { as: keira, body: { careerGoal: 'ICU nurse' } }),
    );
    expect(res.statusCode).toBe(200);
    const suggestions = parse(res).suggestions as { name: string }[];
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.name.includes('BLS/CPR'))).toBe(true);
  });

  it('fetches, updates, and deletes by id through the router', async () => {
    const created = await dispatch(
      event('POST', '/certifications', { as: keira, body: { name: 'First Aid' } }),
    );
    const id = (parse(created) as { certId: string }).certId;

    const got = await dispatch(event('GET', `/certifications/${id}`, { as: keira }));
    expect(got.statusCode).toBe(200);

    const put = await dispatch(
      event('PUT', `/certifications/${id}`, { as: keira, body: { issuingOrganization: 'Red Cross' } }),
    );
    expect(put.statusCode).toBe(200);
    expect((parse(put) as { issuingOrganization: string }).issuingOrganization).toBe('Red Cross');

    const del = await dispatch(event('DELETE', `/certifications/${id}`, { as: keira }));
    expect(del.statusCode).toBe(204);
    const after = await dispatch(event('GET', `/certifications/${id}`, { as: keira }));
    expect(after.statusCode).toBe(404);
  });
});

// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. This proves the whole vertical-slice pipeline
// (JWT identity resolution + routing + zod + visibility + error envelope) the way it runs in the
// Lambda, including the privacy rule, without any AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data)));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });

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
    const res = await dispatch(event('GET', '/activities'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists — and a parent never sees the private entry', async () => {
    const created = await dispatch(
      event('POST', '/activities', { as: keira, body: { date: '2026-03-01', category: 'personal', title: 'Secret', visibility: 'private' } }),
    );
    expect(created.statusCode).toBe(201);

    await dispatch(event('POST', '/activities', { as: keira, body: { date: '2026-03-02', category: 'volunteer', title: 'Public' } }));

    const asKeira = await dispatch(event('GET', '/activities', { as: keira }));
    expect((parse(asKeira).activities as unknown[])).toHaveLength(2);

    const asKate = await dispatch(event('GET', '/activities', { as: kate }));
    const kateItems = parse(asKate).activities as { title: string }[];
    expect(kateItems).toHaveLength(1);
    expect(kateItems[0]?.title).toBe('Public');
  });

  it('a parent fetching a private entry by id gets a 403 envelope', async () => {
    const created = await dispatch(
      event('POST', '/activities', { as: keira, body: { date: '2026-03-01', category: 'personal', title: 'Secret', visibility: 'private' } }),
    );
    const id = (parse(created) as { activityId: string }).activityId;
    const res = await dispatch(event('GET', `/activities/${id}`, { as: kate }));
    expect(res.statusCode).toBe(403);
    expect((parse(res).error as { code: string }).code).toBe('forbidden');
  });

  it('routes /activities/summary to the summary handler (static beats :id)', async () => {
    await dispatch(event('POST', '/activities', { as: keira, body: { date: '2026-03-01', category: 'volunteer', title: 'V', hours: 4 } }));
    const res = await dispatch(event('GET', '/activities/summary', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).totalHours).toBe(4);
  });

  it('forbids a parent from creating a private entry (403)', async () => {
    const res = await dispatch(
      event('POST', '/activities', { as: kate, body: { date: '2026-03-01', category: 'personal', title: 'x', visibility: 'private' } }),
    );
    expect(res.statusCode).toBe(403);
  });
});

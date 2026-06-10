// Router-level two-tenant isolation proof: the FULL request stack — JWT claim -> getRequester ->
// router runWithTenant -> tenant-scoped data client -> repos. Two families hit the real activity-journal
// routes through the real router; neither can see the other's data, and a request with no tenant claim
// is rejected. This is the platform's headline security guarantee at the request boundary.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { tenantScoped } from '../../shared/data/tenant-client.js';
import { buildRoutes, makeHandlers } from './handlers.js';

function harness() {
  const raw = new InMemoryTableClient();
  const data: Data = makeData(tenantScoped(raw), raw); // production-shaped: per-family repos are scoped
  return createRouter(buildRoutes(makeHandlers(() => data)));
}

const jwt = (tenantId?: string) => ({
  'cognito:username': 'parent',
  'custom:role': 'parent',
  ...(tenantId ? { 'custom:tenantId': tenantId } : {}),
});

function event(method: string, path: string, opts: { claims?: Record<string, unknown>; body?: unknown } = {}): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.claims ? { jwt: { claims: opts.claims } } : undefined,
    },
  };
}
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router-level two-tenant isolation', () => {
  it('each family sees only its own activities; cross-tenant fetch 404s; no tenant claim is 401', async () => {
    const dispatch = harness();
    const A = jwt('famA');
    const B = jwt('famB');

    const createdA = await dispatch(
      event('POST', '/activities', { claims: A, body: { date: '2026-06-01', category: 'volunteer', title: 'A event' } }),
    );
    expect(createdA.statusCode).toBe(201);
    await dispatch(
      event('POST', '/activities', { claims: B, body: { date: '2026-06-02', category: 'volunteer', title: 'B event' } }),
    );

    expect((parse(await dispatch(event('GET', '/activities', { claims: A }))).activities as { title: string }[]).map((x) => x.title)).toEqual(['A event']);
    expect((parse(await dispatch(event('GET', '/activities', { claims: B }))).activities as { title: string }[]).map((x) => x.title)).toEqual(['B event']);

    // B cannot fetch A's activity by id (the PK is tenant-prefixed → not found in B's space).
    const aId = (parse(createdA) as { activityId: string }).activityId;
    expect((await dispatch(event('GET', `/activities/${aId}`, { claims: B }))).statusCode).toBe(404);
    expect((await dispatch(event('GET', `/activities/${aId}`, { claims: A }))).statusCode).toBe(200);

    // No tenant claim → 401, fail closed at the router (never an un-scoped read).
    expect((await dispatch(event('GET', '/activities', { claims: jwt() }))).statusCode).toBe(401);
  });
});

// Integration through the real shared router: JWT + routing (static /opportunities/discover and
// /opportunities/bulk-add must beat /opportunities/:id) + zod + envelope. Discovery runs inline via a
// stub discoverer (no AWS).

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Discoverer } from './ai.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown } = {}): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;
const stubDiscoverer: Discoverer = async () => [{ name: 'Habitat Youth Build', type: 'volunteer' }];

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, discoverer: stubDiscoverer })));
  return { dispatch };
}

describe('opportunities router integration', () => {
  it('401s unauthenticated', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/opportunities'))).statusCode).toBe(401);
  });

  it('discover (static beats :id) returns a completed job; create + list work', async () => {
    const { dispatch } = harness();

    const disc = await dispatch(event('POST', '/opportunities/discover', { as: keira, body: { location: 'Orange, CA' } }));
    expect(disc.statusCode).toBe(202);
    expect(parse(disc).status).toBe('complete');
    expect((parse(disc).candidates as { name: string }[])[0]?.name).toBe('Habitat Youth Build');

    const created = await dispatch(
      event('POST', '/opportunities', { as: keira, body: { name: 'Shadow a site superintendent', type: 'shadowing' } }),
    );
    expect(created.statusCode).toBe(201);

    const list = await dispatch(event('GET', '/opportunities', { as: keira }));
    expect((parse(list).opportunities as unknown[]).length).toBe(1);
  });
});

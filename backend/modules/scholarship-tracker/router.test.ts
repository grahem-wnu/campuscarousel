// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. One assertion per endpoint, proving the pipeline
// (JWT identity + routing incl. static-beats-:id + :id/hydrate + zod + error envelope) as it runs in
// the Lambda, without AWS. Discover/hydrate use injected fakes (production gates them on async infra).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const discoverer = { discover: () => Promise.resolve([{ name: 'Discovered Grant', type: 'merit' as const }]) };
const enqueued: unknown[] = [];
const enqueuer = { enqueue: (m: unknown) => (enqueued.push(m), Promise.resolve()) };

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => discoverer, () => enqueuer)));
  enqueued.length = 0;
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });
function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {},
): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: opts.query,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: { http: { method, path }, authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/scholarships'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('creates, lists, fetches, updates, deletes across the family', async () => {
    const created = await dispatch(event('POST', '/scholarships', { as: keira, body: { name: 'Nurses Fund', amount: 5000 } }));
    expect(created.statusCode).toBe(201);
    const id = (parse(created) as { scholarshipId: string }).scholarshipId;

    expect((parse(await dispatch(event('GET', '/scholarships', { as: kate }))).scholarships as unknown[])).toHaveLength(1);
    expect((await dispatch(event('GET', `/scholarships/${id}`, { as: kate }))).statusCode).toBe(200);

    const upd = await dispatch(event('PUT', `/scholarships/${id}`, { as: kate, body: { status: 'applied' } }));
    expect((parse(upd) as { status: string }).status).toBe('applied');

    expect((await dispatch(event('DELETE', `/scholarships/${id}`, { as: keira }))).statusCode).toBe(204);
  });

  it('routes /scholarships/summary to summary (static beats :id)', async () => {
    await data.budget.put({ totalBudget: 50_000 });
    const res = await dispatch(event('GET', '/scholarships/summary', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).budget as { totalBudget: number }).totalBudget).toBe(50_000);
  });

  it('routes /scholarships/discover and persists nothing', async () => {
    const res = await dispatch(event('POST', '/scholarships/discover', { as: keira, body: { query: 'nursing' } }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).results as unknown[])).toHaveLength(1);
    expect((parse(await dispatch(event('GET', '/scholarships', { as: keira }))).scholarships as unknown[])).toHaveLength(0);
  });

  it('bulk-adds selected discoveries', async () => {
    const res = await dispatch(
      event('POST', '/scholarships/bulk-add', { as: keira, body: { scholarships: [{ name: 'One' }, { name: 'Two' }] } }),
    );
    expect(res.statusCode).toBe(201);
    expect((parse(res).scholarships as unknown[])).toHaveLength(2);
  });

  it('routes POST /scholarships/:id/hydrate (202 + enqueues)', async () => {
    const created = await dispatch(event('POST', '/scholarships', { as: keira, body: { name: 'Refresh' } }));
    const id = (parse(created) as { scholarshipId: string }).scholarshipId;
    const res = await dispatch(event('POST', `/scholarships/${id}/hydrate`, { as: keira }));
    expect(res.statusCode).toBe(202);
    expect(enqueued).toHaveLength(1);
  });

  it('422s a bad create body', async () => {
    expect((await dispatch(event('POST', '/scholarships', { as: keira, body: { amount: 5 } }))).statusCode).toBe(422);
  });
});

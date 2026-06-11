// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves the whole pipeline (JWT identity + routing +
// zod + error envelope) the way it runs in the Lambda, one assertion per endpoint, without any AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { GoalSuggester } from './suggester.js';

const suggester: GoalSuggester = {
  suggest: () => Promise.resolve([{ title: 'Volunteer at a clinic', category: 'clinical' }]),
};

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => suggester)));
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
    const res = await dispatch(event('GET', '/goals'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates, lists, fetches, updates, and deletes a goal across the family', async () => {
    const created = await dispatch(
      event('POST', '/goals', { as: keira, body: { title: 'Pass the TEAS', period: 'Junior Year' } }),
    );
    expect(created.statusCode).toBe(201);
    const id = (parse(created) as { goalId: string }).goalId;

    // A parent sees the same family-visible goal.
    const listed = await dispatch(event('GET', '/goals', { as: kate }));
    expect((parse(listed).goals as unknown[])).toHaveLength(1);

    const detail = await dispatch(event('GET', `/goals/${id}`, { as: kate }));
    expect(detail.statusCode).toBe(200);

    const updated = await dispatch(
      event('PUT', `/goals/${id}`, { as: kate, body: { status: 'in-progress', progress: 40 } }),
    );
    expect(updated.statusCode).toBe(200);
    expect((parse(updated) as { progress: number }).progress).toBe(40);

    const removed = await dispatch(event('DELETE', `/goals/${id}`, { as: keira }));
    expect(removed.statusCode).toBe(204);
  });

  it('routes /goals/suggest to the suggest handler (static beats :id) and persists nothing', async () => {
    const res = await dispatch(event('POST', '/goals/suggest', { as: keira, body: { gradeLevel: 'junior' } }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).suggestions as unknown[])).toHaveLength(1);
    const listed = await dispatch(event('GET', '/goals', { as: keira }));
    expect((parse(listed).goals as unknown[])).toHaveLength(0);
  });

  it('422s a bad create body', async () => {
    const res = await dispatch(event('POST', '/goals', { as: keira, body: { description: 'no title' } }));
    expect(res.statusCode).toBe(422);
  });

  it('404s a detail/update/delete on a missing id', async () => {
    expect((await dispatch(event('GET', '/goals/ghost', { as: keira }))).statusCode).toBe(404);
    expect((await dispatch(event('PUT', '/goals/ghost', { as: keira, body: { title: 'x' } }))).statusCode).toBe(404);
    expect((await dispatch(event('DELETE', '/goals/ghost', { as: keira }))).statusCode).toBe(404);
  });
});

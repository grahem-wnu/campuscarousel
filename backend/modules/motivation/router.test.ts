// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. This proves the whole pipeline (JWT identity
// resolution + routing + zod + visibility + error envelope) the way it runs in the Lambda,
// including the privacy rule, without any AWS.

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

const newEntry = (over: Record<string, unknown> = {}) => ({
  date: '2026-03-01',
  title: 'Why I want this',
  content: 'A patient thanked me today.',
  ...over,
});

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/motivations'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists — and a parent never sees the private entry', async () => {
    const created = await dispatch(
      event('POST', '/motivations', { as: keira, body: newEntry({ title: 'Secret', visibility: 'private' }) }),
    );
    expect(created.statusCode).toBe(201);

    await dispatch(event('POST', '/motivations', { as: keira, body: newEntry({ date: '2026-03-02', title: 'Public' }) }));

    const asKeira = await dispatch(event('GET', '/motivations', { as: keira }));
    expect(parse(asKeira).entries as unknown[]).toHaveLength(2);

    const asKate = await dispatch(event('GET', '/motivations', { as: kate }));
    const kateItems = parse(asKate).entries as { title: string }[];
    expect(kateItems).toHaveLength(1);
    expect(kateItems[0]?.title).toBe('Public');
  });

  it('a parent fetching a private entry by id gets a 403 envelope', async () => {
    const created = await dispatch(
      event('POST', '/motivations', { as: keira, body: newEntry({ title: 'Secret', visibility: 'private' }) }),
    );
    const id = (parse(created) as { entryId: string }).entryId;

    const asKate = await dispatch(event('GET', `/motivations/${id}`, { as: kate }));
    expect(asKate.statusCode).toBe(403);
    expect((parse(asKate).error as { code: string }).code).toBe('forbidden');

    // …and keira CAN read the very same private entry by id.
    const asKeira = await dispatch(event('GET', `/motivations/${id}`, { as: keira }));
    expect(asKeira.statusCode).toBe(200);
    expect((parse(asKeira) as { title: string }).title).toBe('Secret');
  });

  it('forbids a parent from creating a private entry (403)', async () => {
    const res = await dispatch(
      event('POST', '/motivations', { as: kate, body: newEntry({ visibility: 'private' }) }),
    );
    expect(res.statusCode).toBe(403);
  });

  it('updates and deletes through the router', async () => {
    const created = await dispatch(event('POST', '/motivations', { as: keira, body: newEntry() }));
    const id = (parse(created) as { entryId: string }).entryId;

    const updated = await dispatch(event('PUT', `/motivations/${id}`, { as: keira, body: { title: 'Refined' } }));
    expect(updated.statusCode).toBe(200);
    expect((parse(updated) as { title: string }).title).toBe('Refined');

    const removed = await dispatch(event('DELETE', `/motivations/${id}`, { as: keira }));
    expect(removed.statusCode).toBe(204);

    const gone = await dispatch(event('GET', `/motivations/${id}`, { as: keira }));
    expect(gone.statusCode).toBe(404);
  });

  it('422s an invalid create body through the router', async () => {
    const res = await dispatch(event('POST', '/motivations', { as: keira, body: { date: 'nope', title: '' } }));
    expect(res.statusCode).toBe(422);
    expect((parse(res).error as { code: string }).code).toBe('validation');
  });
});

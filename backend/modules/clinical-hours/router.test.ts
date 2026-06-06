// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves the whole pipeline (JWT identity resolution +
// routing + zod + visibility + error envelope) the way it runs in the Lambda, including the privacy
// rule, without any AWS. One assertion per endpoint at minimum.

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
  facility: 'Memorial',
  hours: 4,
  ...over,
});

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/clinical'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists — and a parent never sees the private entry', async () => {
    const created = await dispatch(
      event('POST', '/clinical', { as: keira, body: newEntry({ facility: 'Secret Clinic', visibility: 'private' }) }),
    );
    expect(created.statusCode).toBe(201);
    await dispatch(event('POST', '/clinical', { as: keira, body: newEntry({ facility: 'Public Clinic', date: '2026-03-02' }) }));

    const asKeira = await dispatch(event('GET', '/clinical', { as: keira }));
    expect(parse(asKeira).entries as unknown[]).toHaveLength(2);

    const asKate = await dispatch(event('GET', '/clinical', { as: kate }));
    const kateItems = parse(asKate).entries as { facility: string }[];
    expect(kateItems).toHaveLength(1);
    expect(kateItems[0]?.facility).toBe('Public Clinic');
  });

  it('a parent fetching a private entry by id gets a 403 envelope', async () => {
    const created = await dispatch(
      event('POST', '/clinical', { as: keira, body: newEntry({ visibility: 'private' }) }),
    );
    const id = (parse(created) as { entryId: string }).entryId;
    const res = await dispatch(event('GET', `/clinical/${id}`, { as: kate }));
    expect(res.statusCode).toBe(403);
    expect((parse(res).error as { code: string }).code).toBe('forbidden');
  });

  it('updates and deletes a family entry', async () => {
    const created = await dispatch(event('POST', '/clinical', { as: keira, body: newEntry() }));
    const id = (parse(created) as { entryId: string }).entryId;

    const updated = await dispatch(event('PUT', `/clinical/${id}`, { as: keira, body: { hours: 9 } }));
    expect(updated.statusCode).toBe(200);
    expect((parse(updated) as { hours: number }).hours).toBe(9);

    const removed = await dispatch(event('DELETE', `/clinical/${id}`, { as: keira }));
    expect(removed.statusCode).toBe(204);
  });

  it('routes /clinical/summary to the summary handler (static beats :id)', async () => {
    await dispatch(event('POST', '/clinical', { as: keira, body: newEntry({ hours: 4 }) }));
    const res = await dispatch(event('GET', '/clinical/summary', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).totalHours).toBe(4);
  });

  it('routes /clinical/supervisors to the supervisors handler', async () => {
    await dispatch(event('POST', '/clinical', { as: keira, body: newEntry({ supervisorName: 'Dr. X' }) }));
    const res = await dispatch(event('GET', '/clinical/supervisors', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).supervisors as unknown[])).toHaveLength(1);
  });

  it('routes /clinical/export to the export handler and returns a PDF envelope', async () => {
    await dispatch(event('POST', '/clinical', { as: keira, body: newEntry() }));
    const res = await dispatch(event('POST', '/clinical/export', { as: keira, body: {} }));
    expect(res.statusCode).toBe(200);
    expect((parse(res) as { contentType: string }).contentType).toBe('application/pdf');
  });

  it('forbids a parent from creating a private entry (403)', async () => {
    const res = await dispatch(
      event('POST', '/clinical', { as: kate, body: newEntry({ visibility: 'private' }) }),
    );
    expect(res.statusCode).toBe(403);
  });
});

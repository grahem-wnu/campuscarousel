// End-to-end integration through the real shared router: HTTP API v2 event with Cognito JWT claims →
// dispatch → standard envelope. One assertion per endpoint, including the canonical PRIVACY case
// proven end-to-end (Keira's private entry reaches the essay AI; a parent's call never does).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { FindInput } from './ai.js';

let data: Data;
let dispatch: ReturnType<typeof createRouter>;
let lastFind: FindInput | null;

const finder = (input: FindInput) => {
  lastFind = input;
  return Promise.resolve({
    experiences: input.candidates.map((c) => ({ source: c.source, id: c.id, title: c.title, why: 'x' })),
    angles: [],
  });
};
const reviewer = () => Promise.resolve({ strengths: [], suggestions: ['tighten'], authenticity: '', structure: '' });

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => finder, () => reviewer)));
  lastFind = null;
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {}): ApiEvent {
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

async function seedPrivateData() {
  await data.whyNursing.create({ date: '2026-02-01', title: 'Private spark', content: 'secret', visibility: 'private' } as Parameters<Data['whyNursing']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Public vol', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
}

describe('router integration', () => {
  it('401 unauthenticated; 404 unknown path', async () => {
    expect((await dispatch(event('GET', '/essays'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('full essay lifecycle: create → list → detail → draft → review → delete', async () => {
    const created = await dispatch(event('POST', '/essays', { as: keira, body: { prompt: 'Why nursing?' } }));
    expect(created.statusCode).toBe(201);
    const id = (parse(created) as { essayId: string }).essayId;

    expect((parse(await dispatch(event('GET', '/essays', { as: kate }))).essays as unknown[])).toHaveLength(1);
    expect((await dispatch(event('GET', `/essays/${id}`, { as: keira }))).statusCode).toBe(200);

    const drafted = await dispatch(event('PUT', `/essays/${id}`, { as: keira, body: { addDraftContent: 'my draft text here' } }));
    expect(((parse(drafted) as { drafts: unknown[] }).drafts)).toHaveLength(1);

    const reviewed = await dispatch(event('POST', `/essays/${id}/review`, { as: keira }));
    expect(reviewed.statusCode).toBe(200);
    expect((parse(reviewed).feedback as { suggestions: string[] }).suggestions).toContain('tighten');

    expect((await dispatch(event('DELETE', `/essays/${id}`, { as: keira }))).statusCode).toBe(204);
  });

  it('PRIVACY: find-experiences gives Keira her private entry but never a parent', async () => {
    await seedPrivateData();
    const created = await dispatch(event('POST', '/essays', { as: keira, body: { prompt: 'p' } }));
    const id = (parse(created) as { essayId: string }).essayId;

    const asKeira = await dispatch(event('POST', `/essays/${id}/find-experiences`, { as: keira }));
    expect(asKeira.statusCode).toBe(200);
    expect((lastFind?.candidates ?? []).some((c) => c.visibility === 'private')).toBe(true);
    expect((parse(asKeira).experiences as { title: string }[]).map((e) => e.title)).toContain('Private spark');

    const asKate = await dispatch(event('POST', `/essays/${id}/find-experiences`, { as: kate }));
    expect(asKate.statusCode).toBe(200);
    expect((lastFind?.candidates ?? []).every((c) => c.visibility !== 'private')).toBe(true);
    expect((parse(asKate).experiences as { title: string }[]).map((e) => e.title)).not.toContain('Private spark');
  });

  it('422 on a bad create body', async () => {
    expect((await dispatch(event('POST', '/essays', { as: keira, body: { status: 'nope' } }))).statusCode).toBe(422);
  });
});

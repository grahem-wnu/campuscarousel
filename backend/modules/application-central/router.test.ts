// Integration through the real shared router: JWT identity + routing (static /applications/overview
// + nested /essays/:id/draft|find-experiences|review beat /essays/:id) + zod + envelope, as in the
// Lambda, without AWS. Auth gate = 401. AI uses the curated fallback (no model id set).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const now = () => new Date('2026-06-06T00:00:00Z');
let data: Data;
let dispatch: ReturnType<typeof createRouter>;
let prevModel: string | undefined;

beforeEach(() => {
  prevModel = process.env.BEDROCK_MODEL_ID;
  delete process.env.BEDROCK_MODEL_ID; // curated fallback — never calls AWS
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, now })));
});
afterEach(() => {
  if (prevModel !== undefined) process.env.BEDROCK_MODEL_ID = prevModel;
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant' });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {}): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: opts.query,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: { http: { method, path }, authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('401s unauthenticated; 404s unknown path', async () => {
    expect((await dispatch(event('GET', '/essays'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('runs essay create → draft → find-experiences → review with curated AI', async () => {
    const created = await dispatch(event('POST', '/essays', { as: keira, body: { collegeId: 'osu', prompt: 'Why nursing?' } }));
    expect(created.statusCode).toBe(201);
    const id = (parse(created) as { essayId: string }).essayId;

    const draft = await dispatch(event('POST', `/essays/${id}/draft`, { as: keira, body: { content: 'A first draft about my path to nursing.' } }));
    expect(draft.statusCode).toBe(201);

    const find = await dispatch(event('POST', `/essays/${id}/find-experiences`, { as: keira, body: {} }));
    expect(find.statusCode).toBe(200);
    expect((parse(find).result as { source: string }).source).toBe('curated');

    const review = await dispatch(event('POST', `/essays/${id}/review`, { as: keira, body: {} }));
    expect(review.statusCode).toBe(200);
    expect((parse(review).review as { rewrote: boolean }).rewrote).toBe(false);
  });

  it('routes /applications/overview (static beats :id)', async () => {
    const res = await dispatch(event('GET', '/applications/overview', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(parse(res).applications)).toBe(true);
  });

  it('updates and deletes an essay by id', async () => {
    const created = await dispatch(event('POST', '/essays', { as: keira, body: { prompt: 'p' } }));
    const id = (parse(created) as { essayId: string }).essayId;
    const put = await dispatch(event('PUT', `/essays/${id}`, { as: keira, body: { status: 'final' } }));
    expect(parse(put).status).toBe('final');
    expect((await dispatch(event('DELETE', `/essays/${id}`, { as: keira }))).statusCode).toBe(204);
  });
});

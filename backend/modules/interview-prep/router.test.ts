// Integration through the real shared router: JWT identity + routing (static /interviews/mock,
// /interviews/questions, and the nested /interviews/mock/:sessionId/answer beat /interviews/:id) +
// zod + envelope, as it runs in the Lambda, without AWS. Sessions are family-visible → the privacy
// axis at the router level is the auth gate (401). AI uses the curated fallback (no model id set).

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
  delete process.env.BEDROCK_MODEL_ID; // force curated AI fallback — never calls AWS
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
    expect((await dispatch(event('GET', '/interviews'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('serves the curated question bank (static beats :id)', async () => {
    const res = await dispatch(event('GET', '/interviews/questions', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).questions as unknown[]).length).toBeGreaterThan(5);
  });

  it('runs a full mock → answer flow with curated AI', async () => {
    const mock = await dispatch(event('POST', '/interviews/mock', { as: keira, body: { count: 2 } }));
    expect(mock.statusCode).toBe(201);
    const sessionId = ((parse(mock).session as { sessionId: string }).sessionId);
    const ans = await dispatch(event('POST', `/interviews/mock/${sessionId}/answer`, { as: keira, body: { questionIndex: 0, answer: 'A solid answer about why I want to be a nurse.' } }));
    expect(ans.statusCode).toBe(200);
    expect((parse(ans).feedback as { source: string }).source).toBe('curated');
  });

  it('creates, lists, updates, deletes a real-interview log by id', async () => {
    const created = await dispatch(event('POST', '/interviews', { as: keira, body: { type: 'real-interview', date: '2026-05-01', overallNotes: 'x' } }));
    const id = (parse(created) as { sessionId: string }).sessionId;
    expect((await dispatch(event('GET', `/interviews/${id}`, { as: keira }))).statusCode).toBe(200);
    const put = await dispatch(event('PUT', `/interviews/${id}`, { as: keira, body: { confidenceLevel: 4 } }));
    expect(parse(put).confidenceLevel).toBe(4);
    expect((await dispatch(event('DELETE', `/interviews/${id}`, { as: keira }))).statusCode).toBe(204);
  });
});

// End-to-end integration through the real shared router. Proves identity resolution + routing
// (static /exams/progress|study-plan|analyze beat /exams/:id) + zod + envelope, as it runs in the
// Lambda, without AWS. Family-visible → the privacy axis here is the auth gate (401 without a JWT).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const now = () => new Date('2026-06-06T00:00:00Z');
let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, now })));
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
    expect((await dispatch(event('GET', '/exams'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('creates then lists', async () => {
    const created = await dispatch(event('POST', '/exams', { as: keira, body: { type: 'practice-test', date: '2026-03-01', overallScore: 70 } }));
    expect(created.statusCode).toBe(201);
    const list = await dispatch(event('GET', '/exams', { as: keira }));
    expect((parse(list).records as unknown[])).toHaveLength(1);
  });

  it('routes /exams/progress (static beats :id, no AWS/Bedrock)', async () => {
    await dispatch(event('POST', '/exams', { as: keira, body: { type: 'practice-test', date: '2026-03-01', overallScore: 70 } }));
    const res = await dispatch(event('GET', '/exams/progress', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).summary as { attempts: number }).attempts).toBe(1);
  });

  it('routes /exams/study-plan and /exams/analyze to a deterministic curated result (no model id set)', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID; // force the curated fallback so the test never calls AWS
    try {
      await dispatch(event('POST', '/exams', { as: keira, body: { type: 'practice-test', date: '2026-03-01', overallScore: 60, sectionScores: { math: 50 } } }));
      const plan = await dispatch(event('POST', '/exams/study-plan', { as: keira, body: { examDate: '2026-08-01' } }));
      expect(plan.statusCode).toBe(200);
      expect((parse(plan).plan as { source: string }).source).toBe('curated');
      const analyze = await dispatch(event('POST', '/exams/analyze', { as: keira, body: {} }));
      expect(analyze.statusCode).toBe(200);
      expect((parse(analyze).analysis as { source: string }).source).toBe('curated');
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });

  it('updates then deletes by id', async () => {
    const created = await dispatch(event('POST', '/exams', { as: keira, body: { type: 'practice-test', date: '2026-03-01', overallScore: 60 } }));
    const id = (parse(created) as { recordId: string }).recordId;
    const put = await dispatch(event('PUT', `/exams/${id}`, { as: keira, body: { overallScore: 88 } }));
    expect(parse(put).overallScore).toBe(88);
    expect((await dispatch(event('DELETE', `/exams/${id}`, { as: keira }))).statusCode).toBe(204);
    expect((await dispatch(event('GET', `/exams/${id}`, { as: keira }))).statusCode).toBe(404);
  });
});

// Integration through the real shared router: JWT identity + routing (static /timeline/upcoming +
// /timeline/analyze + /timeline) + zod + envelope, as in the Lambda, without AWS. Read-only; the
// privacy axis at the router level is the auth gate (401). AI uses the curated fallback (no model id).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const now = () => new Date('2026-06-06T00:00:00Z');
let data: Data;
let dispatch: ReturnType<typeof createRouter>;
let prevModel: string | undefined;

beforeEach(async () => {
  prevModel = process.env.BEDROCK_MODEL_ID;
  delete process.env.BEDROCK_MODEL_ID; // curated fallback — never calls AWS
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, now })));
  await data.goals.create({ title: 'Submit app', status: 'in-progress', targetDate: '2026-06-20' } as Parameters<Data['goals']['create']>[0]);
});
afterEach(() => {
  if (prevModel !== undefined) process.env.BEDROCK_MODEL_ID = prevModel;
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {}): ApiEvent {
  return { rawPath: path, queryStringParameters: opts.query, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, requestContext: { http: { method, path }, authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined } };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('401s unauthenticated; 404s unknown', async () => {
    expect((await dispatch(event('GET', '/timeline'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('serves /timeline, /timeline/upcoming (static beats nothing), and /timeline/analyze (curated)', async () => {
    const t = await dispatch(event('GET', '/timeline', { as: keira }));
    expect(t.statusCode).toBe(200);
    expect((parse(t).events as unknown[]).length).toBe(1);

    const up = await dispatch(event('GET', '/timeline/upcoming', { as: keira }));
    expect(up.statusCode).toBe(200);
    expect(parse(up).horizon).toBe(90);

    const an = await dispatch(event('POST', '/timeline/analyze', { as: keira, body: {} }));
    expect(an.statusCode).toBe(200);
    expect((parse(an).analysis as { source: string }).source).toBe('curated');
  });
});

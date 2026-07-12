// End-to-end integration through the real shared router: crafted HTTP API v2 events with Cognito
// JWT claims → dispatch → standard envelope. Proves routing (incl. the static-vs-:id precedence for
// /contacts/recommenders and the nested /colleges/:id/touchpoints paths), JWT identity, zod, and the
// error envelope, without any AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { Briefer } from './briefs.js';

const fakeBriefer: Briefer = { brief: async () => 'A brief.' };

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => fakeBriefer)));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });

function event(method: string, path: string, opts: { as?: Requester; body?: unknown } = {}): ApiEvent {
  return {
    rawPath: path,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}

const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/contacts'));
    expect(res.statusCode).toBe(401);
  });

  it('routes nested college touchpoints (create → list)', async () => {
    const college = await data.colleges.create({ name: 'UCLA' } as Parameters<Data['colleges']['create']>[0]);
    const id = college.collegeId;
    const created = await dispatch(event('POST', `/colleges/${id}/touchpoints`, { as: keira, body: { type: 'campus-visit', date: '2026-03-01' } }));
    expect(created.statusCode).toBe(201);
    const list = await dispatch(event('GET', `/colleges/${id}/touchpoints`, { as: keira }));
    expect((parse(list).touchpoints as unknown[])).toHaveLength(1);
  });

  it('routes /contacts/recommenders as a static path (not /contacts/:id)', async () => {
    const res = await dispatch(event('GET', '/contacts/recommenders', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).groups).toBeDefined();
  });

  it('creates a contact then generates a recommender brief through the router', async () => {
    const created = await dispatch(event('POST', '/contacts', { as: keira, body: { name: 'Mr. Chu' } }));
    const cid = parse(created).contactId as string;
    const brief = await dispatch(event('POST', `/contacts/${cid}/recommender-brief`, { as: keira, body: {} }));
    expect(brief.statusCode).toBe(200);
    expect(parse(brief).brief).toBe('A brief.');
  });

  it('routes the cross-college follow-ups view', async () => {
    const res = await dispatch(event('GET', '/touchpoints/follow-ups', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).followUps).toEqual([]);
  });

  it('422s an invalid contact body', async () => {
    const res = await dispatch(event('POST', '/contacts', { as: keira, body: { name: '' } }));
    expect(res.statusCode).toBe(422);
  });
});

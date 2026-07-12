// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves the whole pipeline (JWT identity + routing + zod
// + error envelope) the way it runs in the Lambda, without any AWS. One assertion per endpoint.
// Visits are family-visible, so there is no privacy assertion. AI seams default to curated (offline).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data })));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant' });

function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown } = {},
): ApiEvent {
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

async function seedCollege(over: Record<string, unknown> = {}): Promise<string> {
  const c = await data.colleges.create({ name: 'UC Irvine', ...over } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/colleges/uci/visits'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s visits under an unknown college', async () => {
    const res = await dispatch(event('GET', '/colleges/ghost/visits', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists a visit', async () => {
    const id = await seedCollege();
    const created = await dispatch(event('POST', `/colleges/${id}/visits`, { as: keira, body: { date: '2026-04-01', visitType: 'open-house' } }));
    expect(created.statusCode).toBe(201);
    const list = await dispatch(event('GET', `/colleges/${id}/visits`, { as: keira }));
    expect(parse(list).visits as unknown[]).toHaveLength(1);
  });

  it('updates and deletes a visit', async () => {
    const id = await seedCollege();
    const created = await dispatch(event('POST', `/colleges/${id}/visits`, { as: keira, body: { date: '2026-04-01' } }));
    const vid = (parse(created) as { visitId: string }).visitId;

    const updated = await dispatch(event('PUT', `/colleges/${id}/visits/${vid}`, { as: keira, body: { wouldAttend: 'yes' } }));
    expect(updated.statusCode).toBe(200);
    expect((parse(updated) as { wouldAttend: string }).wouldAttend).toBe('yes');

    const removed = await dispatch(event('DELETE', `/colleges/${id}/visits/${vid}`, { as: keira }));
    expect(removed.statusCode).toBe(204);
  });

  it('routes the deeper /visits/:vid/prep over the shallower :vid route', async () => {
    const id = await seedCollege({ contactInfo: { programAdmissionsEmail: 'n@uci.edu' } });
    const created = await dispatch(event('POST', `/colleges/${id}/visits`, { as: keira, body: { date: '2026-04-01' } }));
    const vid = (parse(created) as { visitId: string }).visitId;
    const res = await dispatch(event('POST', `/colleges/${id}/visits/${vid}/prep`, { as: keira, body: {} }));
    expect(res.statusCode).toBe(200);
    expect(((parse(res).prep as { questions: unknown[] }).questions).length).toBeGreaterThanOrEqual(8);
  });
});

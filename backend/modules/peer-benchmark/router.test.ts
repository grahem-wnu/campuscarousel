// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves routing (incl. the nested
// /colleges/:id/benchmark[...] paths), JWT identity, zod, and the error envelope, without any AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { BenchmarkResearcher } from './researcher.js';

const fakeResearcher: BenchmarkResearcher = {
  research: async () => ({ avgGPAAdmitted: 3.8, typicalClinicalHours: 40 }),
  analyzeGaps: async () => ({ summary: 'Add clinical hours.', gaps: [] }),
};

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => fakeResearcher)));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });

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

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/benchmarks/aggregate'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('routes GET /benchmarks/aggregate', async () => {
    await data.colleges.create({ name: 'UCLA' } as Parameters<Data['colleges']['create']>[0]);
    const res = await dispatch(event('GET', '/benchmarks/aggregate', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect((parse(res).rows as unknown[])).toHaveLength(1);
  });

  it('routes the nested GET /colleges/:id/benchmark and POST .../refresh', async () => {
    const college = await data.colleges.create({ name: 'UCLA' } as Parameters<Data['colleges']['create']>[0]);
    const id = college.collegeId;

    const before = await dispatch(event('GET', `/colleges/${id}/benchmark`, { as: keira }));
    expect(before.statusCode).toBe(200);
    expect(parse(before).benchmark).toBeNull();

    const refreshed = await dispatch(event('POST', `/colleges/${id}/benchmark/refresh`, { as: keira, body: {} }));
    expect(refreshed.statusCode).toBe(200);
    expect((parse(refreshed).benchmark as { avgGPAAdmitted: number }).avgGPAAdmitted).toBe(3.8);

    const after = await dispatch(event('GET', `/colleges/${id}/benchmark`, { as: keira }));
    expect((parse(after).benchmark as { typicalClinicalHours: number }).typicalClinicalHours).toBe(40);
  });

  it('routes GET /benchmarks/gaps', async () => {
    const res = await dispatch(event('GET', '/benchmarks/gaps', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).summary).toContain('clinical');
  });

  it('404s a refresh for a missing college', async () => {
    const res = await dispatch(event('POST', '/colleges/ghost/benchmark/refresh', { as: keira, body: {} }));
    expect(res.statusCode).toBe(404);
  });
});

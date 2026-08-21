// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. This proves the pieces the unit tests can't: that the
// nested `/colleges/:id/scholarships/...` paths route correctly (including static `search` beating
// the `:scholarshipId` pattern), that auth is enforced, and that errors come back as envelopes.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

let data: Data;
let dispatch: ReturnType<typeof createRouter>;
let collegeId: string;

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  const college = await data.colleges.create({ name: 'Ohio State University' });
  collegeId = college.collegeId;
  dispatch = createRouter(
    buildRoutes(
      makeHandlers({
        getData: () => data,
        searchDispatch: async (id) => {
          await data.collegeScholarships.add(id, { name: 'Morrill Scholarship', category: 'academic' });
          await data.collegeScholarshipSearch.patch(id, { status: 'complete', found: 1 });
        },
        researchDispatch: async (id, scholarshipId) => {
          await data.collegeScholarships.update(id, scholarshipId, {
            research: { summary: 'A dossier.' },
            researchStatus: 'complete',
          });
        },
      }),
    ),
  );
});

const claimsFor = (r: Requester) => ({
  'cognito:username': r.username,
  'custom:role': r.role,
  'custom:tenantId': r.tenantId ?? 'test-tenant',
  ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}),
});

function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {},
): ApiEvent {
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

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', `/colleges/${collegeId}/scholarships`));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('searches, then lists what was found — and a parent sees the same family data', async () => {
    const started = await dispatch(event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: {} }));
    expect(started.statusCode).toBe(202);

    const listed = await dispatch(event('GET', `/colleges/${collegeId}/scholarships`, { as: kate }));
    expect(listed.statusCode).toBe(200);
    expect(parse(listed).scholarships as unknown[]).toHaveLength(1);
  });

  it('routes the static /search segment ahead of the :scholarshipId pattern', async () => {
    // If specificity were wrong this would land on GET/:scholarshipId or 404 instead of searching.
    const res = await dispatch(event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: { category: 'athletic' } }));
    expect(res.statusCode).toBe(202);
    expect((await data.collegeScholarshipSearch.get(collegeId))?.category).toBe('athletic');
  });

  it('researches one award end to end', async () => {
    await dispatch(event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: {} }));
    const [award] = await data.collegeScholarships.list(collegeId);
    const id = award!.scholarshipId;

    const res = await dispatch(
      event('POST', `/colleges/${collegeId}/scholarships/${id}/research`, { as: keira, body: {} }),
    );
    expect(res.statusCode).toBe(202);
    expect(parse(res).researchStatus).toBe('complete');

    const detail = await dispatch(event('GET', `/colleges/${collegeId}/scholarships/${id}`, { as: keira }));
    expect(detail.statusCode).toBe(200);
    expect((parse(detail).research as { summary: string }).summary).toBe('A dossier.');
  });

  it('researches several awards from one request', async () => {
    await dispatch(event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: {} }));
    await data.collegeScholarships.add(collegeId, { name: 'Second Award', category: 'athletic' });
    const ids = (await data.collegeScholarships.list(collegeId)).map((s) => s.scholarshipId);

    const res = await dispatch(
      event('POST', `/colleges/${collegeId}/scholarships/research`, { as: keira, body: { scholarshipIds: ids } }),
    );
    expect(res.statusCode).toBe(202);
    expect(parse(res).started).toBe(2);
  });

  it('routes the static /research segment ahead of the :scholarshipId pattern', async () => {
    // `/scholarships/research` (batch) must not be read as scholarshipId="research".
    const res = await dispatch(
      event('POST', `/colleges/${collegeId}/scholarships/research`, { as: keira, body: { scholarshipIds: ['nope'] } }),
    );
    expect(res.statusCode).toBe(404);
    expect((parse(res).error as { message: string }).message).toBe('Scholarship not found');
  });

  it('deletes one award', async () => {
    await dispatch(event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: {} }));
    const [award] = await data.collegeScholarships.list(collegeId);
    const res = await dispatch(
      event('DELETE', `/colleges/${collegeId}/scholarships/${award!.scholarshipId}`, { as: keira }),
    );
    expect(res.statusCode).toBe(200);
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(0);
  });

  it('returns a 404 envelope for a college that is not there', async () => {
    const res = await dispatch(event('GET', '/colleges/missing/scholarships', { as: keira }));
    expect(res.statusCode).toBe(404);
    expect((parse(res).error as { code: string }).code).toBe('not_found');
  });

  it('returns a 422 envelope for an invalid search body', async () => {
    const res = await dispatch(
      event('POST', `/colleges/${collegeId}/scholarships/search`, { as: keira, body: { category: 'nope' } }),
    );
    expect(res.statusCode).toBe(422);
  });
});

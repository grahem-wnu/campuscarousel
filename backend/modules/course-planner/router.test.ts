// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves the whole pipeline (JWT identity resolution +
// routing + zod + error envelope) the way it runs in the Lambda, without any AWS. One assertion per
// endpoint at minimum. Courses are family-visible, so there is no privacy assertion.

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
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('router integration', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await dispatch(event('GET', '/courses'));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists', async () => {
    const created = await dispatch(event('POST', '/courses', { as: keira, body: { name: 'AP Bio', subject: 'science' } }));
    expect(created.statusCode).toBe(201);
    const list = await dispatch(event('GET', '/courses', { as: keira }));
    expect(parse(list).courses as unknown[]).toHaveLength(1);
  });

  it('updates and deletes a course', async () => {
    const created = await dispatch(event('POST', '/courses', { as: keira, body: { name: 'Chem' } }));
    const id = (parse(created) as { courseId: string }).courseId;

    const updated = await dispatch(event('PUT', `/courses/${id}`, { as: keira, body: { grade: 'A' } }));
    expect(updated.statusCode).toBe(200);
    expect((parse(updated) as { grade: string }).grade).toBe('A');

    const removed = await dispatch(event('DELETE', `/courses/${id}`, { as: keira }));
    expect(removed.statusCode).toBe(204);
  });

  it('routes /courses/gpa to the gpa handler (static beats :id)', async () => {
    await dispatch(event('POST', '/courses', { as: keira, body: { name: 'A', grade: 'A', units: 1 } }));
    const res = await dispatch(event('GET', '/courses/gpa', { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).unweighted).toBe(4.0);
  });

  it('routes /courses/prerequisites/:collegeId and 404s an unknown college', async () => {
    const res = await dispatch(event('GET', '/courses/prerequisites/ghost', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('reports prerequisite satisfaction for a real college', async () => {
    const college = await data.colleges.create({
      name: 'CSULB',
      prerequisites: ['Statistics'],
    } as Parameters<Data['colleges']['create']>[0]);
    await dispatch(
      event('POST', '/courses', {
        as: keira,
        body: { name: 'AP Stats', satisfiesPrereq: [{ collegeId: college.collegeId, prereqName: 'Statistics' }] },
      }),
    );
    const res = await dispatch(event('GET', `/courses/prerequisites/${college.collegeId}`, { as: keira }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).satisfiedCount).toBe(1);
    expect(parse(res).gaps as unknown[]).toHaveLength(0);
  });
});

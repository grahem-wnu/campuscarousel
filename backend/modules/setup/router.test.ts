// Integration through the real router: /setup is family-level (tenant claim, no active student
// needed). GET is open to any family role; PUT is admin/parent only and merges (upserts) fields.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

function event(method: string, path: string, claims?: Record<string, unknown>, body?: unknown): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    requestContext: { http: { method, path }, authorizer: claims ? { jwt: { claims } } : undefined },
  };
}
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;
const parent = { 'cognito:username': 'kate', 'custom:role': 'parent', 'custom:tenantId': 'fam1' };
const student = { 'cognito:username': 'keira', 'custom:role': 'student', 'custom:tenantId': 'fam1', 'custom:studentId': 's1' };

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  return { data, dispatch: createRouter(buildRoutes(makeHandlers({ getData: () => data }))) };
}

describe('setup router integration', () => {
  it('401s without a tenant claim', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/setup'))).statusCode).toBe(401);
  });

  it('GET returns {} for a fresh family', async () => {
    const { dispatch } = harness();
    const res = await dispatch(event('GET', '/setup', parent));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({});
  });

  it('a parent can PUT declaredStudentCount, then merge setupComplete', async () => {
    const { dispatch } = harness();
    const put1 = await dispatch(event('PUT', '/setup', parent, { declaredStudentCount: 2 }));
    expect(put1.statusCode).toBe(200);
    expect(parse(put1)).toMatchObject({ declaredStudentCount: 2 });

    const put2 = await dispatch(event('PUT', '/setup', parent, { setupComplete: true }));
    expect(parse(put2)).toMatchObject({ declaredStudentCount: 2, setupComplete: true });

    const get = await dispatch(event('GET', '/setup', parent));
    expect(parse(get)).toMatchObject({ declaredStudentCount: 2, setupComplete: true });
  });

  it('a student may read but NOT write', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/setup', student))).statusCode).toBe(200);
    expect((await dispatch(event('PUT', '/setup', student, { setupComplete: true }))).statusCode).toBe(403);
  });

  it('rejects an out-of-range count (validation)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('PUT', '/setup', parent, { declaredStudentCount: 0 }))).statusCode).toBe(422);
  });
});

// Integration through the real router: the roster is family-level (works with a tenant claim but no
// active student), listing is open to any family role, and mutations are admin/parent only.

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
  return { dispatch: createRouter(buildRoutes(makeHandlers({ getData: () => data }))) };
}

describe('students router integration', () => {
  it('401s without a tenant claim', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/students'))).statusCode).toBe(401);
  });

  it('a parent can create, list, rename, archive, and delete students', async () => {
    const { dispatch } = harness();
    const created = await dispatch(event('POST', '/students', parent, { name: 'Keira', graduationYear: 2030 }));
    expect(created.statusCode).toBe(201);
    const id = parse(created).studentId as string;

    const listed = await dispatch(event('GET', '/students', parent));
    expect((parse(listed).students as unknown[]).length).toBe(1);

    const renamed = await dispatch(event('PATCH', `/students/${id}`, parent, { graduationYear: 2031, status: 'archived' }));
    expect(parse(renamed)).toMatchObject({ graduationYear: 2031, status: 'archived', name: 'Keira' });

    expect((await dispatch(event('DELETE', `/students/${id}`, parent))).statusCode).toBe(204);
    const after = await dispatch(event('GET', '/students', parent));
    expect((parse(after).students as unknown[]).length).toBe(0);
  });

  it('a student may not mutate the roster (403)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/students', student, { name: 'Nope' }))).statusCode).toBe(403);
  });

  it('a student sees ONLY their own roster row (no sibling enumeration)', async () => {
    const { dispatch } = harness();
    // Two siblings on the family roster.
    const a = await dispatch(event('POST', '/students', parent, { name: 'Keira' }));
    const b = await dispatch(event('POST', '/students', parent, { name: 'Sibling' }));
    const keiraId = parse(a).studentId as string;
    void b;

    // A parent sees the whole roster...
    const asParent = await dispatch(event('GET', '/students', parent));
    expect((parse(asParent).students as unknown[]).length).toBe(2);

    // ...but a student pinned to `keiraId` sees exactly their own row and no sibling.
    const pinned = { ...student, 'custom:studentId': keiraId };
    const asStudent = await dispatch(event('GET', '/students', pinned));
    expect(asStudent.statusCode).toBe(200);
    const rows = parse(asStudent).students as Array<{ studentId: string; name: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]?.studentId).toBe(keiraId);
    expect(rows.map((r) => r.name)).not.toContain('Sibling');
  });

  it('404s when patching a student that does not exist', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('PATCH', '/students/missing', parent, { name: 'X' }))).statusCode).toBe(404);
  });
});

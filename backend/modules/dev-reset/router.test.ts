// ⚠️ TEMPORARY TESTING AID — see handlers.ts. Remove with the module.
import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { studentScoped, tenantScoped } from '../../shared/data/tenant-client.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

function event(method: string, path: string, claims?: Record<string, unknown>): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: undefined,
    requestContext: { http: { method, path }, authorizer: claims ? { jwt: { claims } } : undefined },
  };
}
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;
const admin = { 'cognito:username': 'grahem', 'custom:role': 'admin', 'custom:tenantId': 'fam1' };
const parent = { 'cognito:username': 'kate', 'custom:role': 'parent', 'custom:tenantId': 'fam1' };

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  return { data, dispatch: createRouter(buildRoutes(makeHandlers({ getData: () => data }))) };
}

describe('POST /admin/hard-reset', () => {
  it('empties the roster and clears setup state (admin)', async () => {
    const { data, dispatch } = harness();
    await data.students.create({ name: 'Ava', status: 'active' });
    await data.students.create({ name: 'Ben', status: 'active' });
    await data.setupState.put({ declaredStudentCount: 2, setupComplete: true });

    const res = await dispatch(event('POST', '/admin/hard-reset', admin));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ ok: true, studentsRemoved: 2 });

    expect(await data.students.list()).toHaveLength(0);
    const setup = await data.setupState.get();
    expect(setup?.declaredStudentCount).toBeUndefined();
    expect(setup?.setupComplete).toBeUndefined();
  });

  it('purges each removed student’s per-child data (no orphaned partition left behind)', async () => {
    // Production-style scoped wiring so per-child keys are T#fam1#S#<id>#…
    const raw = new InMemoryTableClient();
    const family = tenantScoped(raw);
    const data: Data = makeData(studentScoped(family), raw, family);
    const dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data })));

    const ava = await runWithTenant('fam1', () => data.students.create({ name: 'Ava', status: 'active' }));
    await runWithTenant('fam1', () =>
      runWithStudent(ava.studentId, () =>
        data.colleges.create({ name: 'Tempe U' } as Parameters<Data['colleges']['create']>[0]),
      ),
    );
    const before = await runWithTenant('fam1', () => runWithStudent(ava.studentId, () => data.colleges.list()));
    expect(before).toHaveLength(1);

    const res = await dispatch(event('POST', '/admin/hard-reset', admin));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ ok: true, studentsRemoved: 1 });
    expect(parse(res).itemsPurged as number).toBeGreaterThanOrEqual(1);

    // Ava's college is gone — no orphaned partition.
    const after = await runWithTenant('fam1', () => runWithStudent(ava.studentId, () => data.colleges.list()));
    expect(after).toHaveLength(0);
  });

  it('forbids a non-admin', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/admin/hard-reset', parent))).statusCode).toBe(403);
  });

  it('401s without a tenant claim', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/admin/hard-reset'))).statusCode).toBe(401);
  });
});

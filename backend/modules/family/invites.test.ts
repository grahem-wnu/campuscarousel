// Family invite endpoints (create / list / revoke) through the real router: manager-only gating, the
// student-roster precondition, the shareable {code,url}, tenant-scoped listing (pending only), and
// cross-tenant revoke isolation.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithTenant } from '../../shared/tenant/index.js';
import { buildRoutes, makeHandlers, type FamilyInviter } from './handlers.js';

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
const viewer = { 'cognito:username': 'grandma', 'custom:role': 'member', 'custom:tenantId': 'fam1' };
const student = { 'cognito:username': 'keira', 'custom:role': 'student', 'custom:tenantId': 'fam1', 'custom:studentId': 'stu-1' };

const noopInviter: FamilyInviter = { setRole: async () => {}, removeMember: async () => {} };

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const dispatch = createRouter(
    buildRoutes(makeHandlers({ getData: () => data, inviter: noopInviter, appUrl: 'https://app.example' })),
  );
  const seedStudent = (over: Record<string, unknown> = {}) =>
    runWithTenant('fam1', () => data.students.create({ name: 'Keira', status: 'active', ...over } as never));
  return { data, dispatch, seedStudent };
}

describe('POST /family/invites', () => {
  it('a manager creates a student invite for an existing, unlinked roster id → returns {code, url}', async () => {
    const { dispatch, seedStudent } = harness();
    const stu = await seedStudent();
    const res = await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: stu.studentId }));
    expect(res.statusCode).toBe(201);
    const body = parse(res);
    expect(typeof body.code).toBe('string');
    expect(body.url).toBe(`https://app.example/join-family?code=${body.code as string}`);
  });

  it('rejects a student invite for an unknown roster id (404)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: 'nope' }))).statusCode).toBe(404);
  });

  it('rejects a student invite when that child already has a login (409)', async () => {
    const { dispatch, seedStudent } = harness();
    const stu = await seedStudent({ loginUserId: 'existing' });
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: stu.studentId }))).statusCode).toBe(409);
  });

  it('rejects a second PENDING student invite for the same child (dedupe, 409)', async () => {
    const { dispatch, seedStudent } = harness();
    const stu = await seedStudent();
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: stu.studentId }))).statusCode).toBe(201);
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: stu.studentId }))).statusCode).toBe(409);
  });

  it('allows a NEW student invite when the previous pending one has EXPIRED', async () => {
    const { data, dispatch, seedStudent } = harness();
    const stu = await seedStudent();
    // An expired code can't be redeemed, so it must not block a fresh invite (the child would be
    // permanently un-invitable — nothing ever flips a stored status to 'expired').
    await runWithTenant('fam1', () =>
      data.familyInvites.create({ code: 'OLDEXP', tenantId: 'fam1', kind: 'student', studentId: stu.studentId, invitedBy: 'kate', status: 'pending', expiresAt: '2000-01-01T00:00:00Z' }),
    );
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'student', studentId: stu.studentId }))).statusCode).toBe(201);
  });

  it('creates a co-parent invite (needs a relationship)', async () => {
    const { dispatch } = harness();
    const res = await dispatch(event('POST', '/family/invites', parent, { kind: 'coparent', relationship: 'parent' }));
    expect(res.statusCode).toBe(201);
    expect(typeof parse(res).code).toBe('string');
  });

  it('rejects a co-parent/viewer invite with no relationship (422)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/family/invites', parent, { kind: 'viewer' }))).statusCode).toBe(422);
  });

  it('a viewer caller cannot create invites (403)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/family/invites', viewer, { kind: 'coparent', relationship: 'parent' }))).statusCode).toBe(403);
  });

  it('a student caller cannot create invites (403)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/family/invites', student, { kind: 'coparent', relationship: 'parent' }))).statusCode).toBe(403);
  });
});

describe('GET /family/invites', () => {
  it('returns only this tenant’s pending invites', async () => {
    const { data, dispatch } = harness();
    await dispatch(event('POST', '/family/invites', parent, { kind: 'coparent', relationship: 'parent' }));
    const created = parse(await dispatch(event('POST', '/family/invites', parent, { kind: 'viewer', relationship: 'grandparent' })));
    // Revoke one so it should drop out of the pending list.
    await dispatch(event('POST', `/family/invites/${created.code as string}/revoke`, parent));
    // A different tenant's pending invite must not leak in.
    await runWithTenant('other', () =>
      data.familyInvites.create({ code: 'OTHER', tenantId: 'other', kind: 'viewer', relationship: 'mentor', invitedBy: 'x', status: 'pending', expiresAt: '2999-01-01T00:00:00Z' }),
    );
    const list = parse(await dispatch(event('GET', '/family/invites', parent)));
    const invites = list.invites as Array<{ code: string; status: string; tenantId: string }>;
    expect(invites).toHaveLength(1);
    expect(invites[0]!.status).toBe('pending');
    expect(invites[0]!.tenantId).toBe('fam1');
  });

  it('excludes an expired pending invite (a dead code is not live)', async () => {
    const { data, dispatch } = harness();
    await runWithTenant('fam1', () =>
      data.familyInvites.create({ code: 'DEADCODE', tenantId: 'fam1', kind: 'coparent', relationship: 'parent', invitedBy: 'kate', status: 'pending', expiresAt: '2000-01-01T00:00:00Z' }),
    );
    const list = parse(await dispatch(event('GET', '/family/invites', parent)));
    expect(list.invites).toHaveLength(0);
  });
});

describe('POST /family/invites/:code/revoke', () => {
  it('flips a pending invite to revoked', async () => {
    const { dispatch } = harness();
    const created = parse(await dispatch(event('POST', '/family/invites', parent, { kind: 'coparent', relationship: 'parent' })));
    const res = await dispatch(event('POST', `/family/invites/${created.code as string}/revoke`, parent));
    expect(res.statusCode).toBe(200);
    expect(parse(res).status).toBe('revoked');
  });

  it('cannot revoke a code from another tenant (404)', async () => {
    const { data, dispatch } = harness();
    await runWithTenant('other', () =>
      data.familyInvites.create({ code: 'FOREIGN', tenantId: 'other', kind: 'viewer', relationship: 'mentor', invitedBy: 'x', status: 'pending', expiresAt: '2999-01-01T00:00:00Z' }),
    );
    expect((await dispatch(event('POST', '/family/invites/FOREIGN/revoke', parent))).statusCode).toBe(404);
  });
});

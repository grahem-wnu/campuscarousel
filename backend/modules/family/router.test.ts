// Integration through the real router: who can manage the family, the manager/viewer→role mapping,
// list/update/remove, and the router's view-only enforcement for members. Members are seeded directly
// (new logins are minted by the PUBLIC accept-invite flow, not a family/members endpoint) and the
// Cognito seam is addressed by `username` (== the member record's userId), not email.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data, type FamilyMember } from '../../shared/data/index.js';
import { runWithTenant } from '../../shared/tenant/index.js';
import { buildRoutes, makeHandlers, roleForAccess, type FamilyInviter } from './handlers.js';

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
const member = { 'cognito:username': 'grandma', 'custom:role': 'member', 'custom:tenantId': 'fam1' };

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const calls: string[] = [];
  const inviter: FamilyInviter = {
    setRole: async (i) => void calls.push(`role:${i.username}:${i.role}`),
    removeMember: async (i) => void calls.push(`remove:${i.username}`),
  };
  void data.tenants.create({ tenantId: 'fam1', familyName: 'Cuthbertson', plan: 'free', status: 'active' });
  const seedMember = (m: Partial<FamilyMember> & { userId: string }) =>
    runWithTenant('fam1', () =>
      data.members.put({ relationship: 'grandparent', accessLevel: 'viewer', status: 'active', ...m }),
    );
  const dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, inviter, appUrl: 'https://app' })));
  return { dispatch, calls, seedMember };
}

describe('roleForAccess', () => {
  it('maps manager→parent and viewer→member', () => {
    expect(roleForAccess('manager')).toBe('parent');
    expect(roleForAccess('viewer')).toBe('member');
  });
});

describe('family members router integration', () => {
  it('lists members for any family role, including a view-only member', async () => {
    const { dispatch, seedMember } = harness();
    await seedMember({ userId: 'unc', relationship: 'aunt-uncle', accessLevel: 'manager' });
    const asMember = await dispatch(event('GET', '/family/members', member));
    expect((parse(asMember).members as unknown[]).length).toBe(1);
  });

  it('re-roling a viewer to manager updates their login role by username', async () => {
    const { dispatch, calls, seedMember } = harness();
    await seedMember({ userId: 'g', relationship: 'grandparent', accessLevel: 'viewer' });
    const res = await dispatch(event('PATCH', '/family/members/g', parent, { accessLevel: 'manager' }));
    expect(res.statusCode).toBe(200);
    expect(calls).toContain('role:g:parent'); // addressed by userId/username, not email
  });

  it('removing a member deletes their login (by username) and record', async () => {
    const { dispatch, calls, seedMember } = harness();
    await seedMember({ userId: 'g', relationship: 'mentor', accessLevel: 'viewer' });
    expect((await dispatch(event('DELETE', '/family/members/g', parent))).statusCode).toBe(204);
    expect(calls).toContain('remove:g');
    expect((parse(await dispatch(event('GET', '/family/members', parent))).members as unknown[]).length).toBe(0);
  });

  it('removes a code-invited member with no email (addressed by userId)', async () => {
    const { dispatch, calls, seedMember } = harness();
    await seedMember({ userId: 'keira', relationship: 'child', accessLevel: 'manager', studentId: 'stu-1' });
    expect((await dispatch(event('DELETE', '/family/members/keira', parent))).statusCode).toBe(204);
    expect(calls).toContain('remove:keira');
  });

  it('a view-only member cannot update or remove (router blocks the mutation, 403)', async () => {
    const { dispatch, seedMember } = harness();
    await seedMember({ userId: 'g', relationship: 'grandparent', accessLevel: 'viewer' });
    expect((await dispatch(event('PATCH', '/family/members/g', member, { accessLevel: 'manager' }))).statusCode).toBe(403);
    expect((await dispatch(event('DELETE', '/family/members/g', member))).statusCode).toBe(403);
  });

  it('404 on updating/removing an unknown member', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('PATCH', '/family/members/ghost', parent, { accessLevel: 'manager' }))).statusCode).toBe(404);
    expect((await dispatch(event('DELETE', '/family/members/ghost', parent))).statusCode).toBe(404);
  });
});

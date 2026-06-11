// Integration through the real router: who can manage the family, the manager/viewer→role mapping,
// invite/list/update/remove, and the router's view-only enforcement for members.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
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
  const sent: EmailMessage[] = [];
  const calls: string[] = [];
  const sender: EmailSender = { send: async (m) => void sent.push(m) };
  const inviter: FamilyInviter = {
    inviteMember: async (i) => void calls.push(`invite:${i.email}:${i.role}`),
    setRole: async (i) => void calls.push(`role:${i.email}:${i.role}`),
    removeMember: async (i) => void calls.push(`remove:${i.email}`),
  };
  // Seed the family so the invite email can name it.
  void data.tenants.create({ tenantId: 'fam1', familyName: 'Cuthbertson', plan: 'free', status: 'active' });
  const dispatch = createRouter(
    buildRoutes(makeHandlers({ getData: () => data, inviter, sender, from: 'noreply@x.com', appUrl: 'https://app', genPassword: () => 'Aa1!temp' })),
  );
  return { dispatch, sent, calls };
}

describe('roleForAccess', () => {
  it('maps manager→parent and viewer→member', () => {
    expect(roleForAccess('manager')).toBe('parent');
    expect(roleForAccess('viewer')).toBe('member');
  });
});

describe('family members router integration', () => {
  it('a parent invites a grandparent as a viewer: creates a viewer login + emails credentials', async () => {
    const { dispatch, sent, calls } = harness();
    const res = await dispatch(
      event('POST', '/family/members', parent, {
        email: 'grandma@x.com',
        displayName: 'Grandma Jo',
        relationship: 'grandparent',
        accessLevel: 'viewer',
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(parse(res)).toMatchObject({ email: 'grandma@x.com', relationship: 'grandparent', accessLevel: 'viewer', status: 'active' });
    expect(calls).toContain('invite:grandma@x.com:member'); // viewer → member role
    expect(sent[0]?.to).toBe('grandma@x.com');
    expect(sent[0]?.text).toContain('Aa1!temp');
  });

  it('lists members for any family role, including a view-only member', async () => {
    const { dispatch } = harness();
    await dispatch(event('POST', '/family/members', parent, { email: 'unc@x.com', relationship: 'aunt-uncle', accessLevel: 'manager' }));
    const asMember = await dispatch(event('GET', '/family/members', member));
    expect((parse(asMember).members as unknown[]).length).toBe(1);
  });

  it('re-roling a viewer to manager updates their login role', async () => {
    const { dispatch, calls } = harness();
    await dispatch(event('POST', '/family/members', parent, { email: 'g@x.com', relationship: 'grandparent', accessLevel: 'viewer' }));
    const res = await dispatch(event('PATCH', '/family/members/g@x.com', parent, { accessLevel: 'manager' }));
    expect(res.statusCode).toBe(200);
    expect(calls).toContain('role:g@x.com:parent');
  });

  it('removing a member deletes their login and record', async () => {
    const { dispatch, calls } = harness();
    await dispatch(event('POST', '/family/members', parent, { email: 'g@x.com', relationship: 'mentor', accessLevel: 'viewer' }));
    expect((await dispatch(event('DELETE', '/family/members/g@x.com', parent))).statusCode).toBe(204);
    expect(calls).toContain('remove:g@x.com');
    expect((parse(await dispatch(event('GET', '/family/members', parent))).members as unknown[]).length).toBe(0);
  });

  it('a view-only member cannot invite or remove (router blocks the mutation, 403)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('POST', '/family/members', member, { email: 'x@x.com', relationship: 'other', accessLevel: 'viewer' }))).statusCode).toBe(403);
  });

  it('rejects inviting someone already on the account (409)', async () => {
    const { dispatch } = harness();
    await dispatch(event('POST', '/family/members', parent, { email: 'dup@x.com', relationship: 'other', accessLevel: 'viewer' }));
    expect((await dispatch(event('POST', '/family/members', parent, { email: 'dup@x.com', relationship: 'other', accessLevel: 'viewer' }))).statusCode).toBe(409);
  });
});

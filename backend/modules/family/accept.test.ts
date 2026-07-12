// PUBLIC accept-invite flow (pure, no AWS). SECURITY-critical: role / studentId / tenant are derived
// ONLY from the stored invite (never the caller's body); the code is claimed atomically BEFORE
// provisioning (single-use); a provision failure rolls the claim back to pending so a routine
// "login name taken" lets the invitee retry without burning the code.

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithTenant } from '../../shared/tenant/index.js';
import type { InviteProvisioner } from '../invites/redeem.js';
import { acceptFamilyInvite } from './accept.js';

let data: Data;
let provisioned: Array<{ loginName: string; password: string; tenantId: string; role: string; studentId?: string }>;
let removed: string[];
let failNext: boolean;
let provisioner: InviteProvisioner;

/** The set of logins that currently "exist" in the fake Cognito (created minus deleted). */
const liveLogins = () => provisioned.map((p) => p.loginName).filter((n) => !removed.includes(n));

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  provisioned = [];
  removed = [];
  failNext = false;
  provisioner = {
    provisionFromInvite: async (i) => {
      if (failNext) throw new Error('login name taken');
      provisioned.push(i);
    },
    removeLogin: async ({ username }) => void removed.push(username),
  };
});

const seedInvite = (over: Record<string, unknown> = {}) =>
  data.familyInvites.create({
    code: 'JOIN1',
    tenantId: 'fam1',
    kind: 'student',
    invitedBy: 'kate',
    status: 'pending',
    expiresAt: '2999-01-01T00:00:00Z',
    ...over,
  } as Parameters<Data['familyInvites']['create']>[0]);

const getMember = (userId: string) => runWithTenant('fam1', () => data.members.get(userId));
const getStudent = (studentId: string) => runWithTenant('fam1', () => data.students.get(studentId));

describe('acceptFamilyInvite — student', () => {
  it('derives role/studentId/tenant from the STORED invite, links the child, marks accepted', async () => {
    const stu = await runWithTenant('fam1', () => data.students.create({ name: 'Keira', status: 'active' } as never));
    await seedInvite({ studentId: stu.studentId });

    const res = await acceptFamilyInvite(
      { data, provisioner },
      // Hostile extras (role/studentId/tenantId) must be IGNORED — they come from the invite only.
      { code: 'JOIN1', loginName: 'keira', password: 'Password123!', role: 'admin', studentId: 'evil', tenantId: 'evil' } as never,
    );

    expect(res).toMatchObject({ tenantId: 'fam1', role: 'student', loginName: 'keira' });
    expect(provisioned).toEqual([
      { loginName: 'keira', password: 'Password123!', tenantId: 'fam1', role: 'student', studentId: stu.studentId },
    ]);
    expect(await getMember('keira')).toMatchObject({
      userId: 'keira',
      relationship: 'child',
      accessLevel: 'manager',
      studentId: stu.studentId,
      status: 'active',
      invitedBy: 'kate',
    });
    expect((await getMember('keira'))!.email).toBeUndefined();
    expect((await getStudent(stu.studentId))!.loginUserId).toBe('keira');
    expect((await data.familyInvites.get('JOIN1'))!.status).toBe('accepted');
  });

  it('a second accept of the same code is rejected (single-use) and never re-provisions', async () => {
    const stu = await runWithTenant('fam1', () => data.students.create({ name: 'Keira', status: 'active' } as never));
    await seedInvite({ studentId: stu.studentId });
    await acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'keira', password: 'Password123!' });
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'keira2', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: expect.any(Number) });
    expect(provisioned).toHaveLength(1);
  });

  it('rejects a student invite whose child already has a login (409)', async () => {
    const stu = await runWithTenant('fam1', () => data.students.create({ name: 'Keira', status: 'active', loginUserId: 'someone' } as never));
    await seedInvite({ studentId: stu.studentId });
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'keira', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(provisioned).toHaveLength(0);
  });
});

describe('acceptFamilyInvite — provision failure rollback', () => {
  it('rolls the claim back to pending on provision failure, so the invitee can retry', async () => {
    await seedInvite({ kind: 'coparent', relationship: 'parent', studentId: undefined });
    failNext = true;
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'taken', password: 'Password123!' }),
    ).rejects.toThrow('login name taken');
    // Un-claimed → still pending, and no member/link written.
    expect((await data.familyInvites.get('JOIN1'))!.status).toBe('pending');

    failNext = false;
    const res = await acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'dad', password: 'Password123!' });
    expect(res).toMatchObject({ role: 'parent', loginName: 'dad' });
    expect((await data.familyInvites.get('JOIN1'))!.status).toBe('accepted');
    expect(await getMember('dad')).toMatchObject({ relationship: 'parent', accessLevel: 'manager' });
  });
});

describe('acceptFamilyInvite — one login per child + orphan cleanup', () => {
  it('two concurrent accepts for the same child yield exactly ONE login (loser 409s, no orphan)', async () => {
    const stu = await runWithTenant('fam1', () => data.students.create({ name: 'Keira', status: 'active' } as never));
    await seedInvite({ code: 'CODE_A', studentId: stu.studentId });
    await seedInvite({ code: 'CODE_B', studentId: stu.studentId });

    const results = await Promise.allSettled([
      acceptFamilyInvite({ data, provisioner }, { code: 'CODE_A', loginName: 'keira-a', password: 'Password123!' }),
      acceptFamilyInvite({ data, provisioner }, { code: 'CODE_B', loginName: 'keira-b', password: 'Password123!' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ loginName: string }>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409 });

    // Exactly one Cognito login survives (a loser that provisioned then lost the link race was deleted).
    const winner = fulfilled[0]!.value.loginName;
    expect(liveLogins()).toEqual([winner]);
    expect((await getStudent(stu.studentId))!.loginUserId).toBe(winner);
    expect(await getMember(winner)).toBeTruthy();
  });

  it('deletes the Cognito login + rolls the code back to pending if a post-provision write fails', async () => {
    await seedInvite({ kind: 'coparent', relationship: 'parent', studentId: undefined });
    const origPut = data.members.put;
    data.members.put = (async () => {
      throw new Error('member write failed');
    }) as typeof data.members.put;

    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'dad', password: 'Password123!' }),
    ).rejects.toThrow('member write failed');

    data.members.put = origPut;
    expect(removed).toContain('dad'); // orphan login cleaned up
    expect(liveLogins()).toHaveLength(0);
    expect((await data.familyInvites.get('JOIN1'))!.status).toBe('pending'); // code retryable
  });
});

describe('acceptFamilyInvite — kinds + validation', () => {
  it('co-parent → role parent, viewer → role member (no studentId)', async () => {
    await seedInvite({ kind: 'viewer', relationship: 'grandparent', studentId: undefined });
    const res = await acceptFamilyInvite({ data, provisioner }, { code: 'JOIN1', loginName: 'gran', password: 'Password123!' });
    expect(res.role).toBe('member');
    expect(provisioned[0]!.studentId).toBeUndefined();
    expect(await getMember('gran')).toMatchObject({ relationship: 'grandparent', accessLevel: 'viewer' });
  });

  it('rejects an unknown / revoked / expired code without provisioning', async () => {
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'NOPE', loginName: 'x', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: 422 });

    await seedInvite({ code: 'REVOKED', kind: 'viewer', relationship: 'mentor', studentId: undefined, status: 'revoked' });
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'REVOKED', loginName: 'x', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: 422 });

    await seedInvite({ code: 'OLD', kind: 'viewer', relationship: 'mentor', studentId: undefined, expiresAt: '2000-01-01T00:00:00Z' });
    await expect(
      acceptFamilyInvite({ data, provisioner }, { code: 'OLD', loginName: 'x', password: 'Password123!' }),
    ).rejects.toMatchObject({ status: 422 });

    expect(provisioned).toHaveLength(0);
  });
});

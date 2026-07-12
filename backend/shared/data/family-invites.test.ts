// FamilyInvite registry — GLOBAL (base client, never tenant-prefixed), enumerable per-tenant via
// GSI1PK='FAMILY_INVITES#<tenantId>'. Proves: code-partitioned lookup, per-tenant listing isolation,
// and an ATOMIC single-use claim (a second claim loses).

import { describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData } from './index.js';
import { ConditionFailedError } from './table-client.js';

const newInvite = (over: Record<string, unknown> = {}) => ({
  code: 'abc123',
  tenantId: 't1',
  kind: 'student' as const,
  studentId: 's1',
  invitedBy: 'parent1',
  status: 'pending' as const,
  expiresAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('familyInvites registry (global, per-tenant listing GSI, atomic claim)', () => {
  it('create writes code-partitioned key + per-tenant GSI, and get reads by code globally', async () => {
    const raw = new InMemoryTableClient();
    const data = makeData(raw);
    await data.familyInvites.create(newInvite());
    // Stored under INVITE_FAMILY#<code> / DETAILS with GSI1PK='FAMILY_INVITES#'+tenantId.
    const stored = await raw.get('INVITE_FAMILY#abc123', 'DETAILS');
    expect(stored?.GSI1PK).toBe('FAMILY_INVITES#t1');
    // get is by code (global — no tenant context needed).
    expect(await data.familyInvites.get('abc123')).toMatchObject({ tenantId: 't1', status: 'pending' });
    expect(await data.familyInvites.get('missing')).toBeNull();
  });

  it('listForTenant returns only that tenant\'s invites', async () => {
    const data = makeData(new InMemoryTableClient());
    await data.familyInvites.create(newInvite({ code: 'a', tenantId: 't1' }));
    await data.familyInvites.create(newInvite({ code: 'b', tenantId: 't1' }));
    await data.familyInvites.create(newInvite({ code: 'c', tenantId: 't2' }));
    expect((await data.familyInvites.listForTenant('t1')).map((i) => i.code).sort()).toEqual(['a', 'b']);
    expect((await data.familyInvites.listForTenant('t2')).map((i) => i.code)).toEqual(['c']);
    expect(await data.familyInvites.listForTenant('t3')).toEqual([]);
  });

  it('claim flips pending→accepted, and a SECOND claim REJECTS (atomic single-use)', async () => {
    const data = makeData(new InMemoryTableClient());
    await data.familyInvites.create(newInvite({ code: 'once' }));
    const claimed = await data.familyInvites.claim('once');
    expect(claimed.status).toBe('accepted');
    expect((await data.familyInvites.get('once'))?.status).toBe('accepted');
    // Second claim loses — the guard sees status !== 'pending'.
    await expect(data.familyInvites.claim('once')).rejects.toBeInstanceOf(ConditionFailedError);
  });

  it('claim throws when the invite does not exist', async () => {
    const data = makeData(new InMemoryTableClient());
    await expect(data.familyInvites.claim('nope')).rejects.toBeTruthy();
  });
});

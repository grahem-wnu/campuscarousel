import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { redeemInvite, type TenantProvisioner } from './redeem.js';

let data: Data;
let provisioned: Array<{ email: string; password: string; tenantId: string }>;
let provisioner: TenantProvisioner;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  provisioned = [];
  provisioner = { createParentUser: async (i) => void provisioned.push(i) };
});

async function seedInvite(over: Record<string, unknown> = {}) {
  return data.invites.create({
    code: 'CODE1234',
    email: 'fam@x.com',
    plan: 'free',
    status: 'pending',
    invitedBy: 'grahem',
    ...over,
  } as Parameters<Data['invites']['create']>[0]);
}

describe('redeemInvite', () => {
  it('provisions a tenant + parent user and marks the invite accepted', async () => {
    await seedInvite();
    const res = await redeemInvite(
      { data, provisioner, now: () => new Date('2026-06-10T00:00:00Z'), newTenantId: () => 'fam1' },
      { code: 'CODE1234', email: 'fam@x.com', password: 'pw12345678', familyName: 'Smith' },
    );
    expect(res.tenantId).toBe('fam1');
    expect(await data.tenants.get('fam1')).toMatchObject({ familyName: 'Smith', plan: 'free', status: 'active' });
    expect(provisioned).toEqual([{ email: 'fam@x.com', password: 'pw12345678', tenantId: 'fam1' }]);
    expect(await data.invites.get('CODE1234')).toMatchObject({ status: 'accepted', acceptedTenantId: 'fam1' });
  });

  it('redeems a link-only invite (no pinned email) with whatever email the redeemer provides', async () => {
    await seedInvite({ email: undefined });
    const res = await redeemInvite(
      { data, provisioner, now: () => new Date('2026-06-10T00:00:00Z'), newTenantId: () => 'fam2' },
      { code: 'CODE1234', email: 'anyone@y.com', password: 'pw12345678', familyName: 'Jones' },
    );
    expect(res.tenantId).toBe('fam2');
    expect(provisioned[0]?.email).toBe('anyone@y.com');
    expect(await data.invites.get('CODE1234')).toMatchObject({ status: 'accepted' });
  });

  it('422 on an unknown code', async () => {
    await expect(
      redeemInvite({ data, provisioner }, { code: 'nope', email: 'x@y.com', password: 'pw12345678' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('422 on an email mismatch', async () => {
    await seedInvite();
    await expect(
      redeemInvite({ data, provisioner }, { code: 'CODE1234', email: 'wrong@x.com', password: 'pw12345678' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(provisioned).toEqual([]); // never provisioned on a bad redeem
  });
});

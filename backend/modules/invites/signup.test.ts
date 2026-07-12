import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { TenantProvisioner } from './redeem.js';
import { signupSchema } from './schema.js';
import { publicSignup } from './signup.js';

let data: Data;
let provisioned: Array<{ email: string; password: string; tenantId: string }>;
let provisioner: TenantProvisioner;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  provisioned = [];
  provisioner = { createParentUser: async (i) => void provisioned.push(i) };
});

describe('publicSignup', () => {
  it('provisions a free-plan tenant + the parent user, with a consent stamp', async () => {
    const res = await publicSignup(
      { data, provisioner, now: () => new Date('2026-07-04T00:00:00Z'), newTenantId: () => 'fam1' },
      { email: 'new@x.com', password: 'pw12345678', familyName: 'Nguyen' },
    );
    expect(res.tenantId).toBe('fam1');
    expect(await data.tenants.get('fam1')).toMatchObject({
      familyName: 'Nguyen',
      plan: 'free',
      status: 'active',
      consent: { acceptedAt: '2026-07-04T00:00:00.000Z', byEmail: 'new@x.com' },
    });
    expect(provisioned).toEqual([{ email: 'new@x.com', password: 'pw12345678', tenantId: 'fam1' }]);
  });

  it('defaults the family name when omitted or blank', async () => {
    await publicSignup(
      { data, provisioner, newTenantId: () => 'fam2' },
      { email: 'new@x.com', password: 'pw12345678', familyName: '  ' },
    );
    expect(await data.tenants.get('fam2')).toMatchObject({ familyName: 'Family' });
  });

  it('propagates provisioner failures (tenant may orphan; signup is retryable)', async () => {
    provisioner = {
      createParentUser: async () => {
        throw new Error('cognito down');
      },
    };
    await expect(
      publicSignup({ data, provisioner, newTenantId: () => 'fam3' }, { email: 'new@x.com', password: 'pw12345678' }),
    ).rejects.toThrow('cognito down');
  });
});

describe('signupSchema', () => {
  const valid = { email: 'new@x.com', password: 'pw12345678' };

  it('accepts a minimal valid body', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short passwords, bad emails, and unknown keys (no invite code here)', () => {
    expect(signupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, code: 'ABCD1234' }).success).toBe(false);
  });
});

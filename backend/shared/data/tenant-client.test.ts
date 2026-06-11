import { beforeEach, describe, expect, it } from 'vitest';
import { TenantContextError, runWithTenant } from '../tenant/index.js';
import { InMemoryTableClient } from './memory-client.js';
import type { StoredItem } from './table-client.js';
import { tenantScoped } from './tenant-client.js';

let raw: InMemoryTableClient;
let c: ReturnType<typeof tenantScoped>;

beforeEach(() => {
  raw = new InMemoryTableClient();
  c = tenantScoped(raw);
});

const item = (over: Partial<StoredItem> = {}): StoredItem => ({
  PK: 'ACTIVITY#1',
  SK: 'DETAILS',
  GSI1PK: 'ACTIVITIES',
  GSI1SK: 'd#1',
  GSI2PK: 'CATEGORY#volunteer',
  GSI2SK: 'd#1',
  ...over,
});

describe('tenantScoped', () => {
  it('prefixes PK + all GSIxPK and round-trips within a tenant', async () => {
    await runWithTenant('t1', async () => {
      await c.put(item());
      const got = await c.get('ACTIVITY#1', 'DETAILS');
      expect(got).toBeTruthy();
      expect(got?.PK).toBe('T#t1#ACTIVITY#1');
    });
    // Raw storage carries the prefix on PK and every GSI partition.
    const stored = await runWithTenant('t1', () => raw.get('T#t1#ACTIVITY#1', 'DETAILS'));
    expect(stored?.GSI1PK).toBe('T#t1#ACTIVITIES');
    expect(stored?.GSI2PK).toBe('T#t1#CATEGORY#volunteer');
  });

  it('isolates a GSI2 (non-GSI1) query across tenants', async () => {
    await runWithTenant('t1', () => c.put(item()));
    const inT1 = await runWithTenant('t1', () => c.queryIndex('GSI2', 'CATEGORY#volunteer'));
    const inT2 = await runWithTenant('t2', () => c.queryIndex('GSI2', 'CATEGORY#volunteer'));
    expect(inT1).toHaveLength(1);
    expect(inT2).toHaveLength(0);
  });

  it('isolates a base-table query across tenants', async () => {
    await runWithTenant('t1', () => c.put(item({ PK: 'COLLEGE#x', SK: 'NOTE#1', GSI1PK: undefined, GSI2PK: undefined })));
    const inT1 = await runWithTenant('t1', () => c.query('COLLEGE#x'));
    const inT2 = await runWithTenant('t2', () => c.query('COLLEGE#x'));
    expect(inT1.length).toBeGreaterThan(0);
    expect(inT2).toHaveLength(0);
  });

  it('fails closed when there is no tenant context', async () => {
    await expect(c.get('ACTIVITY#1', 'DETAILS')).rejects.toBeInstanceOf(TenantContextError);
    await expect(c.put(item())).rejects.toBeInstanceOf(TenantContextError);
  });
});

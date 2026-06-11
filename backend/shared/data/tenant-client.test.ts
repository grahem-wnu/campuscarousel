import { beforeEach, describe, expect, it } from 'vitest';
import { StudentContextError, TenantContextError, runWithStudent, runWithTenant } from '../tenant/index.js';
import { InMemoryTableClient } from './memory-client.js';
import type { StoredItem } from './table-client.js';
import { studentScoped, tenantScoped } from './tenant-client.js';

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

describe('studentScoped(tenantScoped(...)) — per-child tier', () => {
  let perChild: ReturnType<typeof studentScoped>;
  beforeEach(() => {
    perChild = studentScoped(tenantScoped(raw));
  });
  const run = <T>(tenant: string, student: string, fn: () => Promise<T> | T) =>
    runWithTenant(tenant, () => runWithStudent(student, fn));

  it('prefixes PK + every GSIxPK with both tiers: T#<t>#S#<s>#', async () => {
    await run('t1', 's1', () => perChild.put(item()));
    const stored = await runWithTenant('t1', () => raw.get('T#t1#S#s1#ACTIVITY#1', 'DETAILS'));
    expect(stored).toBeTruthy();
    expect(stored?.GSI1PK).toBe('T#t1#S#s1#ACTIVITIES');
    expect(stored?.GSI2PK).toBe('T#t1#S#s1#CATEGORY#volunteer');
    // The decorated client round-trips and strips internal keys.
    const got = await run('t1', 's1', () => perChild.get('ACTIVITY#1', 'DETAILS'));
    expect(got?.PK).toBe('T#t1#S#s1#ACTIVITY#1');
  });

  it('isolates two children within the SAME tenant', async () => {
    await run('t1', 's1', () => perChild.put(item()));
    const forS1 = await run('t1', 's1', () => perChild.queryIndex('GSI1', 'ACTIVITIES'));
    const forS2 = await run('t1', 's2', () => perChild.queryIndex('GSI1', 'ACTIVITIES'));
    expect(forS1).toHaveLength(1);
    expect(forS2).toHaveLength(0);
  });

  it('isolates the same child id across different tenants', async () => {
    await run('t1', 's1', () => perChild.put(item()));
    const inT1 = await run('t1', 's1', () => perChild.query('ACTIVITY#1', { skBeginsWith: 'DETAILS' }));
    const inT2 = await run('t2', 's1', () => perChild.query('ACTIVITY#1', { skBeginsWith: 'DETAILS' }));
    expect(inT1.length).toBeGreaterThan(0);
    expect(inT2).toHaveLength(0);
  });

  it('fails closed when a tenant is set but no student is selected', async () => {
    await expect(runWithTenant('t1', () => perChild.get('ACTIVITY#1', 'DETAILS'))).rejects.toBeInstanceOf(
      StudentContextError,
    );
    await expect(runWithTenant('t1', () => perChild.put(item()))).rejects.toBeInstanceOf(StudentContextError);
  });
});

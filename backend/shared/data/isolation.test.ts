// Two-tenant isolation proof at the data layer: the real makeData repos, through the tenantScoped
// client, under two AsyncLocalStorage tenant contexts. This is the core security guarantee of the SaaS
// platform — one family physically cannot read another's data. (A router-level proof follows once auth
// carries the tenant claim.)

import { describe, expect, it } from 'vitest';
import { runWithTenant } from '../tenant/index.js';
import { InMemoryTableClient, makeData, type Data } from './index.js';
import { tenantScoped } from './tenant-client.js';

/** Production-shaped data accessor: per-family repos scoped, registry on the raw base client. */
function tenantData(raw: InMemoryTableClient): Data {
  return makeData(tenantScoped(raw), raw);
}

type NewActivity = Parameters<Data['activities']['create']>[0];
const activity = (over: Partial<NewActivity>): NewActivity =>
  ({ userId: 'kid', date: '2026-06-01', category: 'volunteer', title: 'x', visibility: 'family', ...over }) as NewActivity;

describe('two-tenant data isolation', () => {
  it('each family sees only its own collection, and cross-tenant get returns null', async () => {
    const raw = new InMemoryTableClient();
    const data = tenantData(raw);

    const aAct = await runWithTenant('A', () => data.activities.create(activity({ title: 'A soup kitchen' })));
    await runWithTenant('B', () => data.activities.create(activity({ title: 'B hospital' })));

    expect((await runWithTenant('A', () => data.activities.list())).map((x) => x.title)).toEqual(['A soup kitchen']);
    expect((await runWithTenant('B', () => data.activities.list())).map((x) => x.title)).toEqual(['B hospital']);

    // PK is tenant-prefixed → A's item is invisible to B by id, visible to A.
    expect(await runWithTenant('B', () => data.activities.get(aAct.activityId))).toBeNull();
    expect(await runWithTenant('A', () => data.activities.get(aAct.activityId))).toMatchObject({ title: 'A soup kitchen' });
  });

  it('singletons (budget) are per-tenant', async () => {
    const raw = new InMemoryTableClient();
    const data = tenantData(raw);
    await runWithTenant('A', () => data.budget.put({ totalBudget: 200000 }));
    await runWithTenant('B', () => data.budget.put({ totalBudget: 50000 }));
    expect((await runWithTenant('A', () => data.budget.get()))?.totalBudget).toBe(200000);
    expect((await runWithTenant('B', () => data.budget.get()))?.totalBudget).toBe(50000);
  });

  it('a GSI2 lookup (activities by category) is isolated', async () => {
    const raw = new InMemoryTableClient();
    const data = tenantData(raw);
    await runWithTenant('A', () => data.activities.create(activity({ category: 'clinical', title: 'A clinical' })));
    expect((await runWithTenant('A', () => data.activities.listByCategory('clinical'))).length).toBe(1);
    expect((await runWithTenant('B', () => data.activities.listByCategory('clinical'))).length).toBe(0);
  });

  it('the tenant registry is GLOBAL (not tenant-scoped)', async () => {
    const raw = new InMemoryTableClient();
    const data = tenantData(raw);
    await data.tenants.create({ tenantId: 'A', familyName: 'Fam A', plan: 'free', status: 'active' });
    // Visible with no tenant context, and from inside any tenant's context.
    expect((await data.tenants.list()).map((t) => t.tenantId)).toEqual(['A']);
    expect(await runWithTenant('B', () => data.tenants.get('A'))).toMatchObject({ familyName: 'Fam A' });
  });
});

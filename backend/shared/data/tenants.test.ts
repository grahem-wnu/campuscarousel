import { describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData } from './index.js';

// The tenant registry is the one GLOBAL namespace — usable with no tenant context set.
describe('tenant registry', () => {
  it('creates, gets, and lists tenants (global, no tenant context)', async () => {
    const data = makeData(new InMemoryTableClient());
    await data.tenants.create({ tenantId: 't1', familyName: 'Cuthbertson', plan: 'free', status: 'active' });
    await data.tenants.create({ tenantId: 't2', familyName: 'Other', plan: 'family', status: 'active' });
    expect((await data.tenants.list()).map((t) => t.tenantId).sort()).toEqual(['t1', 't2']);
    expect(await data.tenants.get('t1')).toMatchObject({ familyName: 'Cuthbertson', plan: 'free' });
    expect(await data.tenants.get('missing')).toBeNull();
  });

  it('update merges and preserves createdAt', async () => {
    const data = makeData(new InMemoryTableClient());
    const created = await data.tenants.create({ tenantId: 't1', familyName: 'A', plan: 'free', status: 'active' });
    const updated = await data.tenants.update('t1', { status: 'suspended' });
    expect(updated).toMatchObject({ status: 'suspended', familyName: 'A', createdAt: created.createdAt });
  });
});

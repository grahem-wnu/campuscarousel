// Integration through the real router: admin gating + tenant scoping for GET /admin/usage.
// A tenant admin sees only their own family; a platform admin may target any family via ?tenantId=;
// a non-platform admin's ?tenantId= override is IGNORED. Usage rows are seeded directly into an
// InMemoryTableClient under the literal T#<tenant>#USAGE partitions the handler reads by base client.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent, type RouteDef } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data, type StoredItem } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

function event(
  method: string,
  path: string,
  claims?: Record<string, unknown>,
  query?: Record<string, string>,
): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: query,
    body: undefined,
    requestContext: { http: { method, path }, authorizer: claims ? { jwt: { claims } } : undefined },
  };
}
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

const adminFam1 = { 'cognito:username': 'kate', 'custom:role': 'admin', 'custom:tenantId': 'fam1' };
const platformAdmin = { ...adminFam1, 'custom:platformAdmin': 'true' };
const parentFam1 = { 'cognito:username': 'kate', 'custom:role': 'parent', 'custom:tenantId': 'fam1' };
const adminNoTenant = { 'cognito:username': 'kate', 'custom:role': 'admin' };

function usageRow(tenant: string, sk: string, extra: Partial<StoredItem> = {}): StoredItem {
  return {
    PK: `T#${tenant}#USAGE`,
    SK: `TS#${sk}`,
    feature: 'focus',
    model: 'anthropic.claude-sonnet-4',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicros: 100,
    occurredAt: sk,
    ...extra,
  };
}

function harness(seed: (c: InMemoryTableClient) => void) {
  const client = new InMemoryTableClient();
  seed(client);
  const data: Data = makeData(client);
  const h = makeHandlers({ getClient: () => client, getData: () => data });
  const routes: RouteDef[] = [
    { method: 'GET', path: '/admin/usage', handler: h.usage, roles: ['admin'] },
    { method: 'GET', path: '/admin/usage/families', handler: h.families, platformAdmin: true },
  ];
  return { dispatch: createRouter(routes), client, data };
}

describe('admin-usage router integration', () => {
  it('admin of fam1 with groupBy=feature → 200 with only fam1 totals', async () => {
    const { dispatch } = harness((c) => {
      void c.put(usageRow('fam1', '2026-07-01T00:00:00.000Z#call1', { feature: 'focus', costMicros: 100 }));
      void c.put(usageRow('fam1', '2026-07-02T00:00:00.000Z#call2', { feature: 'exam-prep', costMicros: 40 }));
      void c.put(usageRow('fam2', '2026-07-02T00:00:00.000Z#call3', { feature: 'focus', costMicros: 999 }));
    });
    const res = await dispatch(event('GET', '/admin/usage', adminFam1, { groupBy: 'feature' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.tenantId).toBe('fam1');
    expect(body.totalCostMicros).toBe(140); // fam2's 999 excluded
    expect((body.buckets as unknown[]).length).toBe(2);
  });

  it('non-platform admin of fam1 with ?tenantId=fam2 is still scoped to fam1 (override ignored)', async () => {
    const { dispatch } = harness((c) => {
      void c.put(usageRow('fam1', '2026-07-01T00:00:00.000Z#call1', { costMicros: 100 }));
      void c.put(usageRow('fam2', '2026-07-01T00:00:00.000Z#call2', { costMicros: 999 }));
    });
    const res = await dispatch(event('GET', '/admin/usage', adminFam1, { groupBy: 'feature', tenantId: 'fam2' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.tenantId).toBe('fam1');
    expect(body.totalCostMicros).toBe(100);
  });

  it('platform admin with ?tenantId=fam2 reads fam2', async () => {
    const { dispatch } = harness((c) => {
      void c.put(usageRow('fam1', '2026-07-01T00:00:00.000Z#call1', { costMicros: 100 }));
      void c.put(usageRow('fam2', '2026-07-01T00:00:00.000Z#call2', { costMicros: 999 }));
    });
    const res = await dispatch(event('GET', '/admin/usage', platformAdmin, { groupBy: 'feature', tenantId: 'fam2' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.tenantId).toBe('fam2');
    expect(body.totalCostMicros).toBe(999);
  });

  it('parent role → 403', async () => {
    const { dispatch } = harness(() => {});
    const res = await dispatch(event('GET', '/admin/usage', parentFam1, { groupBy: 'feature' }));
    expect(res.statusCode).toBe(403);
  });

  it('admin with no tenant claim → 401', async () => {
    const { dispatch } = harness(() => {});
    const res = await dispatch(event('GET', '/admin/usage', adminNoTenant, { groupBy: 'feature' }));
    expect(res.statusCode).toBe(401);
  });

  it('from/to range filters rows by SK', async () => {
    const { dispatch } = harness((c) => {
      void c.put(usageRow('fam1', '2026-06-30T00:00:00.000Z#early', { costMicros: 11 })); // before range
      void c.put(usageRow('fam1', '2026-07-05T00:00:00.000Z#mid', { costMicros: 22 })); // in range
      void c.put(usageRow('fam1', '2026-08-15T00:00:00.000Z#late', { costMicros: 33 })); // after range
    });
    const res = await dispatch(
      event('GET', '/admin/usage', adminFam1, {
        groupBy: 'feature',
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-31T23:59:59Z',
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.totalCostMicros).toBe(22); // only the in-range row
  });

  it('admin with no tenant claim falls back to the router-established DEFAULT_TENANT_ID', async () => {
    // The router applies DEFAULT_TENANT_ID (set to "primary" in api-stack) for admins whose JWT lacks
    // custom:tenantId, and runs the handler inside runWithTenant('primary'). The handler must resolve the
    // EFFECTIVE tenant, not the raw (absent) claim — otherwise it 400s where every other route succeeds.
    const prev = process.env.DEFAULT_TENANT_ID;
    process.env.DEFAULT_TENANT_ID = 'primary';
    try {
      const { dispatch } = harness((c) => {
        void c.put(usageRow('primary', '2026-07-01T00:00:00.000Z#call1', { costMicros: 100 }));
        void c.put(usageRow('fam2', '2026-07-01T00:00:00.000Z#call2', { costMicros: 999 }));
      });
      const res = await dispatch(event('GET', '/admin/usage', adminNoTenant, { groupBy: 'feature' }));
      expect(res.statusCode).toBe(200);
      const body = parse(res);
      expect(body.tenantId).toBe('primary');
      expect(body.totalCostMicros).toBe(100); // reads T#primary#USAGE, not fam2
    } finally {
      if (prev === undefined) delete process.env.DEFAULT_TENANT_ID;
      else process.env.DEFAULT_TENANT_ID = prev;
    }
  });
});

describe('GET /admin/usage/families', () => {
  // Seed tenants via data.tenants.create (stamps GSI1PK/GSI1SK so tenants.list() finds them); usage
  // rows go in as raw puts on the same client under T#<tenant>#USAGE (what the handler reads by PK).
  async function familiesHarness(
    seedTenants: (data: Data) => Promise<void>,
    seedUsage: (c: InMemoryTableClient) => void,
  ) {
    const client = new InMemoryTableClient();
    const data: Data = makeData(client);
    await seedTenants(data);
    seedUsage(client);
    const h = makeHandlers({ getClient: () => client, getData: () => data });
    return createRouter([
      { method: 'GET', path: '/admin/usage/families', handler: h.families, platformAdmin: true },
    ]);
  }

  const threeTenants = async (data: Data) => {
    await data.tenants.create({
      tenantId: 'fam1',
      familyName: 'Alpha',
      plan: 'free',
      status: 'active',
      consent: { acceptedAt: '2026-07-01T00:00:00.000Z', byEmail: 'alpha@x.com' },
    });
    await data.tenants.create({ tenantId: 'fam2', familyName: 'Beta', plan: 'free', status: 'active' });
    await data.tenants.create({ tenantId: 'fam3', familyName: 'Gamma', plan: 'free', status: 'active' });
  };

  it('platform admin → 200, families ranked by cost desc, zero-usage tenant included, grand total', async () => {
    const dispatch = await familiesHarness(threeTenants, (c) => {
      void c.put(usageRow('fam1', '2026-07-01T00:00:00.000Z#a', { costMicros: 100, inputTokens: 10, outputTokens: 5 }));
      void c.put(usageRow('fam1', '2026-07-02T00:00:00.000Z#b', { costMicros: 40, inputTokens: 4, outputTokens: 2 }));
      void c.put(usageRow('fam2', '2026-07-02T00:00:00.000Z#c', { costMicros: 999, inputTokens: 20, outputTokens: 8 }));
      // fam3 has NO usage rows — must still appear with zeros.
    });
    const res = await dispatch(event('GET', '/admin/usage/families', platformAdmin));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    const families = body.families as Array<Record<string, unknown>>;
    expect(families.map((f) => f.tenantId)).toEqual(['fam2', 'fam1', 'fam3']); // cost desc; zero-usage fam3 last
    expect(families[0]).toMatchObject({ tenantId: 'fam2', familyName: 'Beta', costMicros: 999, calls: 1 });
    // The signup email (consent record) rides along to disambiguate same-named families; tenants
    // provisioned before consent capture simply omit it.
    expect(families[1]).toMatchObject({ tenantId: 'fam1', familyName: 'Alpha', email: 'alpha@x.com', costMicros: 140, inputTokens: 14, calls: 2 });
    expect(families[1].email).toBe('alpha@x.com');
    expect(families[2]).toMatchObject({ tenantId: 'fam3', familyName: 'Gamma', costMicros: 0, inputTokens: 0, calls: 0 });
    expect(families[2].email).toBeUndefined();
    expect(body.totalCostMicros).toBe(1139);
  });

  it('from/to range filters rows per tenant (out-of-range excluded)', async () => {
    const dispatch = await familiesHarness(
      async (data) => {
        await data.tenants.create({ tenantId: 'fam1', familyName: 'Alpha', plan: 'free', status: 'active' });
      },
      (c) => {
        void c.put(usageRow('fam1', '2026-06-30T00:00:00.000Z#early', { costMicros: 11 })); // before
        void c.put(usageRow('fam1', '2026-07-05T00:00:00.000Z#mid', { costMicros: 22 })); // in
        void c.put(usageRow('fam1', '2026-08-15T00:00:00.000Z#late', { costMicros: 33 })); // after
      },
    );
    const res = await dispatch(
      event('GET', '/admin/usage/families', platformAdmin, {
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-31T23:59:59Z',
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body.totalCostMicros).toBe(22);
    expect((body.families as Array<Record<string, unknown>>)[0]).toMatchObject({ costMicros: 22, calls: 1 });
  });

  it('non-platform admin (role admin) → 403', async () => {
    const dispatch = await familiesHarness(async () => {}, () => {});
    const res = await dispatch(event('GET', '/admin/usage/families', adminFam1));
    expect(res.statusCode).toBe(403);
  });

  it('parent → 403', async () => {
    const dispatch = await familiesHarness(async () => {}, () => {});
    const res = await dispatch(event('GET', '/admin/usage/families', parentFam1));
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/usage/reconciliation', () => {
  function reconHarness(seed: (c: InMemoryTableClient) => void) {
    const client = new InMemoryTableClient();
    seed(client);
    const data: Data = makeData(client);
    const h = makeHandlers({ getClient: () => client, getData: () => data });
    return createRouter([
      { method: 'GET', path: '/admin/usage/reconciliation', handler: h.reconciliation, platformAdmin: true },
    ]);
  }

  const statusRow = (month: string, extra: Partial<StoredItem> = {}): StoredItem => ({
    PK: 'GLOBAL#RECON',
    SK: `MONTH#${month}`,
    month,
    appCostMicros: 1_000_000,
    awsCostMicros: 950_000,
    driftPct: 5.26,
    appTokens: 140,
    awsTokens: 138,
    breach: true,
    computedAt: '2026-07-13T07:00:00.000Z',
    caveat: 'account-total incl. staging noise; Cost Explorer ~24h delayed',
    ...extra,
  });

  it('platform admin → 200 with the seeded status row for ?month=', async () => {
    const dispatch = reconHarness((c) => {
      void c.put(statusRow('2026-07'));
    });
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', platformAdmin, { month: '2026-07' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body).toMatchObject({
      month: '2026-07',
      appCostMicros: 1_000_000,
      awsCostMicros: 950_000,
      driftPct: 5.26,
      breach: true,
      computedAt: '2026-07-13T07:00:00.000Z',
    });
    expect(String(body.caveat)).toContain('Cost Explorer');
  });

  it('platform admin → 200 with actualsAvailable:false + null aws/drift when actuals were unavailable', async () => {
    const dispatch = reconHarness((c) => {
      void c.put(
        statusRow('2026-07', {
          awsCostMicros: null,
          driftPct: null,
          awsTokens: null,
          breach: false,
          actualsAvailable: false,
        }),
      );
    });
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', platformAdmin, { month: '2026-07' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body).toMatchObject({ month: '2026-07', appCostMicros: 1_000_000, actualsAvailable: false, breach: false });
    expect(body.awsCostMicros).toBeNull();
    expect(body.driftPct).toBeNull();
  });

  it('platform admin → 200 with actualsAvailable:true for a normal computed row', async () => {
    const dispatch = reconHarness((c) => {
      void c.put(statusRow('2026-07', { actualsAvailable: true }));
    });
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', platformAdmin, { month: '2026-07' }));
    const body = parse(res);
    expect(body).toMatchObject({ actualsAvailable: true, breach: true });
  });

  it('platform admin → 200 with not_computed when the month has no status row', async () => {
    const dispatch = reconHarness(() => {});
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', platformAdmin, { month: '2026-07' }));
    expect(res.statusCode).toBe(200);
    const body = parse(res);
    expect(body).toEqual({ month: '2026-07', status: 'not_computed' });
  });

  it('non-platform admin (role admin) → 403', async () => {
    const dispatch = reconHarness(() => {});
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', adminFam1, { month: '2026-07' }));
    expect(res.statusCode).toBe(403);
  });

  it('parent → 403', async () => {
    const dispatch = reconHarness(() => {});
    const res = await dispatch(event('GET', '/admin/usage/reconciliation', parentFam1));
    expect(res.statusCode).toBe(403);
  });
});

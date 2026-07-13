// Integration through the real router: admin gating + tenant scoping for GET /admin/usage.
// A tenant admin sees only their own family; a platform admin may target any family via ?tenantId=;
// a non-platform admin's ?tenantId= override is IGNORED. Usage rows are seeded directly into an
// InMemoryTableClient under the literal T#<tenant>#USAGE partitions the handler reads by base client.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent, type RouteDef } from '../../shared/api/index.js';
import { InMemoryTableClient, type StoredItem } from '../../shared/data/index.js';
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
  const routes: RouteDef[] = [
    { method: 'GET', path: '/admin/usage', handler: makeHandlers({ getClient: () => client }).usage, roles: ['admin'] },
  ];
  return { dispatch: createRouter(routes), client };
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

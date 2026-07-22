// GET /admin/usage — per-family Bedrock token spend, admin-gated. Runs in tenant context
// (roles: ['admin']), but reads the target partition via the BASE (unscoped) client with an
// explicit `T#<tenantId>#USAGE` PK so a platform admin can cross tenants via ?tenantId=. A
// non-platform admin is always scoped to their own family — their ?tenantId= override is ignored.

import { type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import { type Data, type TableClient } from '../../shared/data/index.js';
import { maybeTenantId } from '../../shared/tenant/index.js';
import { aggregate, type GroupBy } from './aggregate.js';
import { rankFamilies, summarizeFamily, type FamilyUsageRow } from './families.js';
import { queryAll, rangeToSkOpts, toUsageRow } from './reads.js';

const requireAdmin = requireRole('admin');
const GROUP_BY = new Set<GroupBy>(['feature', 'student', 'model', 'day']);

export interface AdminUsageDeps {
  getClient: () => TableClient;
  getData: () => Data; // for the tenant registry (families endpoint)
}

export function makeHandlers(deps: AdminUsageDeps) {
  const usage: Handler = async (ctx) => {
    requireAdmin(ctx.requester);
    const req = ctx.requester;
    // Platform admin may target any tenant; a tenant admin is always scoped to their own. When there's
    // no platform-admin override, resolve the EFFECTIVE tenant the router established (which applies the
    // DEFAULT_TENANT_ID fallback for admins whose JWT lacks custom:tenantId), not the raw claim.
    const tenantId = req.platformAdmin && ctx.query.tenantId ? ctx.query.tenantId : (req.tenantId ?? maybeTenantId());
    if (!tenantId) {
      return { status: 400, body: { error: { code: 'validation', message: 'tenantId required' } } };
    }

    const groupBy: GroupBy = GROUP_BY.has(ctx.query.groupBy as GroupBy)
      ? (ctx.query.groupBy as GroupBy)
      : 'feature';
    const skOpts = rangeToSkOpts(ctx.query.from, ctx.query.to);

    const client = deps.getClient();
    const items = await queryAll(client, `T#${tenantId}#USAGE`, skOpts);
    const rows = items.map(toUsageRow);
    return { status: 200, body: { tenantId, groupBy, ...aggregate(rows, groupBy) } };
  };

  // GET /admin/usage/families — platformAdmin-only all-families ranking. The router enforces
  // platformAdmin, so there is NO in-handler tenant scoping (never call currentTenantId here). Reads
  // go through the BASE (un-scoped) client + the global tenant registry.
  // On-read cost: N tenants × their range's rows, one Query each — O(N) queries. Fine at current
  // scale; Phase 2B monthly rollups make this O(1). Never silently cap the tenant list.
  const families: Handler = async (ctx) => {
    const skOpts = rangeToSkOpts(ctx.query.from, ctx.query.to);
    const client = deps.getClient();
    const tenants = await deps.getData().tenants.list();
    const rows: FamilyUsageRow[] = [];
    for (const t of tenants) {
      const items = await queryAll(client, `T#${t.tenantId}#USAGE`, skOpts);
      const s = summarizeFamily(items.map(toUsageRow));
      rows.push({ tenantId: t.tenantId, familyName: t.familyName, email: t.consent?.byEmail, ...s });
    }
    return { status: 200, body: rankFamilies(rows) };
  };

  // GET /admin/usage/reconciliation — platformAdmin-only. Returns the latest drift-reconciliation
  // status for `?month=YYYY-MM` (default current UTC month). The status row is written by the prod-only
  // reconcile job under GLOBAL#RECON / MONTH#<month>, so it's read with a DIRECT get() — never
  // rangeToSkOpts (that builds TS#… ranges, wrong for MONTH#-keyed rows). Absent → not_computed
  // (staging is always not_computed; reconciliation runs in prod only).
  const reconciliation: Handler = async (ctx) => {
    const month = /^\d{4}-\d{2}$/.test(ctx.query.month ?? '')
      ? ctx.query.month
      : new Date().toISOString().slice(0, 7);
    const client = deps.getClient();
    const row = await client.get('GLOBAL#RECON', `MONTH#${month}`);
    if (!row) return { status: 200, body: { month, status: 'not_computed' } };
    // `actualsAvailable: false` means the rollups were recomputed but AWS actuals (Cost Explorer /
    // invocation logs) couldn't be fetched this run — awsCostMicros/driftPct/awsTokens are null.
    // Distinct from `not_computed` (no run at all). Legacy rows without the flag are treated available.
    return {
      status: 200,
      body: {
        month: row.month ?? month,
        appCostMicros: row.appCostMicros,
        awsCostMicros: row.awsCostMicros ?? null,
        driftPct: row.driftPct ?? null,
        appTokens: row.appTokens,
        awsTokens: row.awsTokens ?? null,
        breach: row.breach,
        actualsAvailable: row.actualsAvailable !== false,
        computedAt: row.computedAt,
        caveat: row.caveat,
      },
    };
  };

  return { usage, families, reconciliation };
}

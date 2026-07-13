// GET /admin/usage — per-family Bedrock token spend, admin-gated. Runs in tenant context
// (roles: ['admin']), but reads the target partition via the BASE (unscoped) client with an
// explicit `T#<tenantId>#USAGE` PK so a platform admin can cross tenants via ?tenantId=. A
// non-platform admin is always scoped to their own family — their ?tenantId= override is ignored.

import { type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import { type TableClient } from '../../shared/data/index.js';
import { maybeTenantId } from '../../shared/tenant/index.js';
import { aggregate, type GroupBy } from './aggregate.js';
import { queryAll, rangeToSkOpts, toUsageRow } from './reads.js';

const requireAdmin = requireRole('admin');
const GROUP_BY = new Set<GroupBy>(['feature', 'student', 'model', 'day']);

export interface AdminUsageDeps {
  getClient: () => TableClient;
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
  return { usage };
}

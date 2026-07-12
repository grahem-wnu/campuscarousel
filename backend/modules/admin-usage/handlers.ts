// GET /admin/usage — per-family Bedrock token spend, admin-gated. Runs in tenant context
// (roles: ['admin']), but reads the target partition via the BASE (unscoped) client with an
// explicit `T#<tenantId>#USAGE` PK so a platform admin can cross tenants via ?tenantId=. A
// non-platform admin is always scoped to their own family — their ?tenantId= override is ignored.

import { type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import { type TableClient } from '../../shared/data/index.js';
import { aggregate, type GroupBy, type UsageRow } from './aggregate.js';

const requireAdmin = requireRole('admin');
const GROUP_BY = new Set<GroupBy>(['feature', 'student', 'model', 'day']);

export interface AdminUsageDeps {
  getClient: () => TableClient;
}

export function makeHandlers(deps: AdminUsageDeps) {
  const usage: Handler = async (ctx) => {
    requireAdmin(ctx.requester);
    const req = ctx.requester;
    // Platform admin may target any tenant; a tenant admin is always scoped to their own.
    const tenantId = req.platformAdmin && ctx.query.tenantId ? ctx.query.tenantId : req.tenantId;
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

// Paginate the Query so a wide range for an active family is not truncated at 1 MB. DynamoTableClient.query
// already follows LastEvaluatedKey (do/while loop), and InMemoryTableClient returns the full partition, so a
// single call suffices.
async function queryAll(
  client: TableClient,
  pk: string,
  opts: { skBetween?: [string, string] },
): Promise<Array<Record<string, unknown>>> {
  return (await client.query(pk, opts)) as Array<Record<string, unknown>>;
}

function rangeToSkOpts(from?: string, to?: string): { skBetween?: [string, string] } {
  if (from && to) return { skBetween: [`TS#${from}`, `TS#${to}~`] };
  if (from) return { skBetween: [`TS#${from}`, 'TS#~'] };
  return {}; // whole partition
}

function toUsageRow(it: Record<string, unknown>): UsageRow {
  return {
    feature: String(it.feature ?? ''),
    model: String(it.model ?? ''),
    studentId: it.studentId as string | undefined,
    inputTokens: Number(it.inputTokens ?? 0),
    outputTokens: Number(it.outputTokens ?? 0),
    cacheReadTokens: Number(it.cacheReadTokens ?? 0),
    cacheWriteTokens: Number(it.cacheWriteTokens ?? 0),
    costMicros: Number(it.costMicros ?? 0),
    occurredAt: String(it.occurredAt ?? ''),
  };
}

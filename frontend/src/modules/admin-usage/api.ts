import { api } from '../../shared/api';
import type { FamiliesUsageResponse, GroupBy, ReconciliationResponse, UsageResponse } from './types';

/** Fetch per-family Bedrock token spend. `tenantId` is only honored server-side for a platform admin. */
export function getUsage(opts: {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  tenantId?: string;
}): Promise<UsageResponse> {
  const query: Record<string, string> = { groupBy: opts.groupBy };
  if (opts.from) query.from = opts.from;
  if (opts.to) query.to = opts.to;
  if (opts.tenantId) query.tenantId = opts.tenantId;
  return api.get<UsageResponse>('/admin/usage', { query });
}

/** Fetch the all-families ranking (platform admin only, server-enforced). */
export function getFamiliesUsage(opts: { from?: string; to?: string }): Promise<FamiliesUsageResponse> {
  const query: Record<string, string> = {};
  if (opts.from) query.from = opts.from;
  if (opts.to) query.to = opts.to;
  return api.get<FamiliesUsageResponse>('/admin/usage/families', { query });
}

/** Fetch the latest drift reconciliation status for a month (platform admin only, server-enforced).
 *  `month` is `YYYY-MM`; omitted → the server's current UTC month. Staging always returns not_computed. */
export function getReconciliation(opts: { month?: string } = {}): Promise<ReconciliationResponse> {
  const query: Record<string, string> = {};
  if (opts.month) query.month = opts.month;
  return api.get<ReconciliationResponse>('/admin/usage/reconciliation', { query });
}

/** Micro-dollars → a "$1,234.56" string (2 fixed decimals). */
export const formatUsd = (micros: number): string =>
  `$${(micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

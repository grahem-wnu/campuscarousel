import { api } from '../../shared/api';
import type { GroupBy, UsageResponse } from './types';

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

/** Micro-dollars → a "$1,234.56" string (2 fixed decimals). */
export const formatUsd = (micros: number): string =>
  `$${(micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

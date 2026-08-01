// backend/shared/data/last-seen.ts
//
// Family engagement signal: when did anyone in this family last authenticate?
//
// The admin usage dashboard could report what AI cost, but not whether anyone was still showing up —
// a family that logs in, looks around and leaves generated no usage rows and so read as "never
// active". This stamps a lightweight row on every authenticated request so churn is visible.

import { tableClientFromEnv, type TableClient } from './table-client.js';

/** How long one container waits before re-stamping the same user. */
export const THROTTLE_MS = 60 * 60 * 1000; // 1h

/** SK prefix for the per-user last-seen rows inside the global `TENANT#<id>` partition. */
export const LAST_SEEN_SK_PREFIX = 'LASTSEEN#';

export interface LastSeenInput {
  tenantId: string;
  userId: string;
  role: string;
  /** ISO timestamp; injected by the caller so tests pin exact values. */
  now: string;
}

export interface LastSeenDeps {
  client?: TableClient;
  /** Epoch millis for the throttle decision; defaults to Date.now(). */
  nowMs?: number;
}

let cached: TableClient | undefined;

/**
 * Per-container throttle. Lambda reuses containers, so this collapses a burst of requests into ~one
 * write per user per hour with NO read to decide — the request path pays at most a single put.
 * A cold start costs one extra write, which is harmless.
 */
const lastWrittenMs = new Map<string, number>();

/** Test seam: forget the throttle state so each test starts cold. */
export function resetLastSeenThrottleForTest(): void {
  lastWrittenMs.clear();
  cached = undefined;
}

/**
 * Record that `userId` was active in `tenantId`.
 *
 * Written as `TENANT#<tenantId>` / `LASTSEEN#<userId>` — a SEPARATE key, deliberately:
 *   - `TenantRepo.update()` writes the whole tenant item back with `put`, so a `lastSeenAt`
 *     ATTRIBUTE on `DETAILS` would be silently clobbered by any concurrent tenant edit.
 *   - No `GSI1PK` is set. The tenant registry is enumerated via `GSI1PK = 'TENANTS'`; indexing these
 *     rows would make `tenants.list()` return one phantom family per user.
 *
 * NEVER throws — engagement telemetry must not be able to fail a user's request. Mirrors the
 * fail-safe contract of `recordUsage`.
 */
export async function recordLastSeen(input: LastSeenInput, deps: LastSeenDeps = {}): Promise<void> {
  try {
    // No table configured and no injected client → not a deployed environment (unit tests, local
    // route checks). Silently do nothing rather than throw-and-log on every single request; CDK
    // always injects TABLE_NAME in staging/prod.
    if (!deps.client && !process.env.TABLE_NAME) return;

    const key = `${input.tenantId}#${input.userId}`;
    const nowMs = deps.nowMs ?? Date.now();
    const previous = lastWrittenMs.get(key);
    if (previous !== undefined && nowMs - previous < THROTTLE_MS) return;

    const client = deps.client ?? (cached ??= tableClientFromEnv());
    await client.put({
      PK: `TENANT#${input.tenantId}`,
      SK: `${LAST_SEEN_SK_PREFIX}${input.userId}`,
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      lastSeenAt: input.now,
    });
    // Only mark as written AFTER a successful put, so a transient failure retries on the next request
    // instead of being suppressed for an hour.
    lastWrittenMs.set(key, nowMs);
  } catch (err) {
    console.error('[last-seen] recordLastSeen failed (swallowed)', {
      tenantId: input.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** One family member's last-seen row, as read back for the admin dashboard. */
export interface LastSeenRow {
  userId: string;
  role: string;
  lastSeenAt: string;
}

/** Read every member's last-seen row for one tenant. Returns [] when none have been stamped yet. */
export async function readLastSeen(client: TableClient, tenantId: string): Promise<LastSeenRow[]> {
  const items = await client.query(`TENANT#${tenantId}`, { skBeginsWith: LAST_SEEN_SK_PREFIX });
  return (items as Array<Record<string, unknown>>).map((i) => ({
    userId: String(i.userId ?? ''),
    role: String(i.role ?? ''),
    lastSeenAt: String(i.lastSeenAt ?? ''),
  }));
}

/** The most recent stamp across a family's members, or null when nobody has been seen. */
export function latestSeenAt(rows: LastSeenRow[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (r.lastSeenAt && (latest === null || r.lastSeenAt > latest)) latest = r.lastSeenAt;
  }
  return latest;
}

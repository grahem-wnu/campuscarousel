// backend/shared/data/last-seen.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient } from './memory-client.js';
import {
  LAST_SEEN_SK_PREFIX,
  THROTTLE_MS,
  latestSeenAt,
  readLastSeen,
  recordLastSeen,
  resetLastSeenThrottleForTest,
} from './last-seen.js';
import { makeTenants } from './collections.js';

const input = (over: Partial<Parameters<typeof recordLastSeen>[0]> = {}) => ({
  tenantId: 'fam1',
  userId: 'kate',
  role: 'parent',
  now: '2026-08-01T12:00:00.000Z',
  ...over,
});

beforeEach(() => resetLastSeenThrottleForTest());

describe('recordLastSeen', () => {
  it('writes a per-user row under the tenant partition', async () => {
    const client = new InMemoryTableClient();
    await recordLastSeen(input(), { client, nowMs: 0 });
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      PK: 'TENANT#fam1',
      SK: 'LASTSEEN#kate',
      tenantId: 'fam1',
      userId: 'kate',
      role: 'parent',
      lastSeenAt: '2026-08-01T12:00:00.000Z',
    });
  });

  it('sets no GSI attributes — these rows must not pollute tenants.list()', async () => {
    const client = new InMemoryTableClient();
    const tenants = makeTenants(client);
    await tenants.create({ tenantId: 'fam1', familyName: 'Cuthbertson' } as never);
    await recordLastSeen(input(), { client, nowMs: 0 });
    const listed = await tenants.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.tenantId).toBe('fam1');
  });

  it('skips a repeat write inside the throttle window', async () => {
    const client = new InMemoryTableClient();
    await recordLastSeen(input(), { client, nowMs: 0 });
    await recordLastSeen(input({ now: '2026-08-01T12:30:00.000Z' }), { client, nowMs: THROTTLE_MS - 1 });
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSeenAt).toBe('2026-08-01T12:00:00.000Z'); // not overwritten
  });

  it('writes again once the throttle window has elapsed', async () => {
    const client = new InMemoryTableClient();
    await recordLastSeen(input(), { client, nowMs: 0 });
    await recordLastSeen(input({ now: '2026-08-01T13:00:00.000Z' }), { client, nowMs: THROTTLE_MS });
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(1); // same key, overwritten in place
    expect(rows[0]?.lastSeenAt).toBe('2026-08-01T13:00:00.000Z');
  });

  it('throttles per user, not per family', async () => {
    const client = new InMemoryTableClient();
    await recordLastSeen(input({ userId: 'kate' }), { client, nowMs: 0 });
    await recordLastSeen(input({ userId: 'keira' }), { client, nowMs: 0 });
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(2);
  });

  it('never throws — a write failure is swallowed so the request still succeeds', async () => {
    const exploding = {
      put: async () => {
        throw new Error('boom');
      },
    } as never;
    await expect(recordLastSeen(input(), { client: exploding, nowMs: 0 })).resolves.toBeUndefined();
  });

  it('does not suppress the next attempt after a failed write', async () => {
    const exploding = { put: async () => { throw new Error('boom'); } } as never;
    await recordLastSeen(input(), { client: exploding, nowMs: 0 });
    const client = new InMemoryTableClient();
    await recordLastSeen(input(), { client, nowMs: 1 }); // well inside the throttle window
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(1);
  });
});

describe('write timeout', () => {
  it('gives up on a hung write instead of holding the request', async () => {
    const hung = { put: () => new Promise<void>(() => {}) } as never; // never settles
    const started = Date.now();
    await expect(recordLastSeen(input(), { client: hung, nowMs: 0, timeoutMs: 20 })).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not mark the throttle when the write timed out, so the next request retries', async () => {
    const hung = { put: () => new Promise<void>(() => {}) } as never;
    await recordLastSeen(input(), { client: hung, nowMs: 0, timeoutMs: 20 });
    const client = new InMemoryTableClient();
    await recordLastSeen(input(), { client, nowMs: 1 }); // well inside the throttle window
    const rows = await client.query('TENANT#fam1', { skBeginsWith: LAST_SEEN_SK_PREFIX });
    expect(rows).toHaveLength(1);
  });
});

describe('environment guard', () => {
  it('does nothing when neither a client nor TABLE_NAME is available', async () => {
    const before = process.env.TABLE_NAME;
    delete process.env.TABLE_NAME;
    try {
      // No client injected → must return quietly rather than throwing from tableClientFromEnv().
      await expect(recordLastSeen(input(), { nowMs: 0 })).resolves.toBeUndefined();
    } finally {
      if (before !== undefined) process.env.TABLE_NAME = before;
    }
  });
});

describe('readLastSeen / latestSeenAt', () => {
  it('reads back every member and picks the most recent stamp', async () => {
    const client = new InMemoryTableClient();
    await recordLastSeen(input({ userId: 'kate', now: '2026-07-20T00:00:00.000Z' }), { client, nowMs: 0 });
    await recordLastSeen(input({ userId: 'keira', now: '2026-07-26T00:00:00.000Z' }), { client, nowMs: 0 });
    const rows = await readLastSeen(client, 'fam1');
    expect(rows).toHaveLength(2);
    expect(latestSeenAt(rows)).toBe('2026-07-26T00:00:00.000Z');
  });

  it('returns [] and null for a family nobody has visited', async () => {
    const client = new InMemoryTableClient();
    expect(await readLastSeen(client, 'ghost')).toEqual([]);
    expect(latestSeenAt([])).toBeNull();
  });
});

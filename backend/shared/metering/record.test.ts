// backend/shared/metering/record.test.ts
import { describe, expect, it } from 'vitest';
import { InMemoryTableClient } from '../data/index.js';
import { runWithStudent, runWithTenant } from '../tenant/index.js';
import { REGIONAL_PREMIUM } from './pricing.js';
import { recordUsage } from './record.js';

const rates = { 'anthropic.claude-sonnet-4': { inputMicros: 3, outputMicros: 15, cacheReadMicros: 1, cacheWriteMicros: 4 } };

function input() {
  return {
    feature: 'exam-prep',
    model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    requestId: 'req1',
    callId: 'call1',
    occurredAt: '2026-07-12T10:00:00.000Z',
  };
}

describe('recordUsage', () => {
  it('writes an append-only row under T#<tenant>#USAGE with priced cost + student', async () => {
    const client = new InMemoryTableClient();
    await runWithTenant('fam1', () =>
      runWithStudent('stu1', () => recordUsage(input(), { client, rates })),
    );
    const rows = await client.query('T#fam1#USAGE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      PK: 'T#fam1#USAGE',
      SK: 'TS#2026-07-12T10:00:00.000Z#call1',
      feature: 'exam-prep',
      studentId: 'stu1',
      inputTokens: 100,
      outputTokens: 40,
      // The fixture model is a `us.` (geo-scoped) profile, which bills at REGIONAL_PREMIUM over the
      // base rate table: (100*3 + 40*15) * 1.1 = 990.
      costMicros: Math.round((100 * 3 + 40 * 15) * REGIONAL_PREMIUM),
      unpriced: false,
    });
  });

  it('records with no studentId when no student context is set', async () => {
    const client = new InMemoryTableClient();
    await runWithTenant('fam1', () => recordUsage(input(), { client, rates }));
    const rows = await client.query('T#fam1#USAGE');
    expect(rows[0]?.studentId).toBeUndefined();
  });

  it('never throws — a client failure is swallowed (metering must not break the AI call)', async () => {
    const failing = { put: async () => { throw new Error('boom'); } } as unknown as InMemoryTableClient;
    await expect(
      runWithTenant('fam1', () => recordUsage(input(), { client: failing, rates })),
    ).resolves.toBeUndefined();
  });
});

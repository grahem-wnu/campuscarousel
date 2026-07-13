// backend/shared/metering/invoke-messages.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient } from '../data/index.js';
import { runWithTenant } from '../tenant/index.js';
import { invokeMessages } from './invoke-messages.js';

const ORIGINAL = process.env.BEDROCK_MODEL_ID;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BEDROCK_MODEL_ID;
  else process.env.BEDROCK_MODEL_ID = ORIGINAL;
});

function fakeClient(text: string, usage: Record<string, number>) {
  const send = vi.fn(async () => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }], usage })),
  }));
  return { send } as never;
}

describe('invokeMessages', () => {
  it('returns the completion text AND records usage attributed to feature + tenant', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    const client = fakeClient('hello', { input_tokens: 10, output_tokens: 4 });
    const meterClient = new InMemoryTableClient();
    const out = await runWithTenant('fam1', () =>
      invokeMessages({
        feature: 'goal-suggest',
        prompt: 'suggest',
        client,
        recordDeps: {
          client: meterClient,
          rates: {
            'anthropic.claude-sonnet-4': {
              inputMicros: 3,
              outputMicros: 15,
              cacheReadMicros: 1,
              cacheWriteMicros: 4,
            },
          },
        },
      }),
    );
    expect(out).toBe('hello');
    const rows = await meterClient.query('T#fam1#USAGE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'goal-suggest', inputTokens: 10, outputTokens: 4 });
  });

  it('throws when BEDROCK_MODEL_ID is unset (caller decides the fallback)', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    await expect(
      runWithTenant('fam1', () =>
        invokeMessages({ feature: 'goal-suggest', prompt: 'x', client: fakeClient('', {}) }),
      ),
    ).rejects.toThrow('BEDROCK_MODEL_ID');
  });
});

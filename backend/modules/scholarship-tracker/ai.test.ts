import { describe, expect, it, vi } from 'vitest';
import { extractJson, makeBedrockDiscoverer, makeBedrockHydrator, pickHydratableFields, type BedrockInvoker } from './ai.js';

/** Fake Bedrock client returning a Claude-messages body with the given assistant text. */
function fakeClient(text: string): { client: BedrockInvoker; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async (_command: unknown) => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }] })),
  }));
  return { client: { send } as BedrockInvoker, send };
}

const opts = (text: string) => ({ modelId: 'us.anthropic.test', client: fakeClient(text).client });

describe('extractJson', () => {
  it('pulls a JSON array out of prose + code fences', () => {
    expect(extractJson('Sure:\n```json\n[{"name":"X"}]\n```')).toEqual([{ name: 'X' }]);
  });
  it('throws when there is no JSON', () => {
    expect(() => extractJson('nope')).toThrow();
  });
});

describe('pickHydratableFields', () => {
  it('keeps allowlisted fields and drops everything else (name/status/awardedAmount/notes)', () => {
    const out = pickHydratableFields({
      provider: 'ANA',
      amount: 5000,
      type: 'nursing-specific',
      name: 'should be ignored',
      status: 'awarded',
      awardedAmount: 9999,
      notes: 'user-owned',
    });
    expect(out).toEqual({ provider: 'ANA', amount: 5000, type: 'nursing-specific' });
  });
});

describe('makeBedrockDiscoverer', () => {
  it('parses model output into candidates', async () => {
    const d = makeBedrockDiscoverer(opts('[{"name":"Nurses Grant","amount":3000,"type":"nursing-specific"}]'));
    const out = await d.discover({ query: 'nursing' });
    expect(out).toEqual([{ name: 'Nurses Grant', amount: 3000, type: 'nursing-specific' }]);
  });

  it('returns [] on any failure (e.g. missing model id, never throws)', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    const d = makeBedrockDiscoverer({ client: fakeClient('[]').client }); // no modelId → invoke throws → []
    await expect(d.discover({})).resolves.toEqual([]);
    if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
  });
});

describe('makeBedrockHydrator', () => {
  it('returns allowlisted fields + hydrationStatus complete on success', async () => {
    const h = makeBedrockHydrator(opts('{"provider":"ANA","amount":5000,"status":"awarded"}'));
    const out = await h({ name: 'Future Nurses' });
    expect(out).toEqual({ provider: 'ANA', amount: 5000, hydrationStatus: 'complete' });
  });

  it('returns hydrationStatus failed on malformed output (never throws)', async () => {
    const h = makeBedrockHydrator(opts('the model rambled with no json'));
    await expect(h({ name: 'X' })).resolves.toEqual({ hydrationStatus: 'failed' });
  });
});

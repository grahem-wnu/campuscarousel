import { describe, expect, it } from 'vitest';
import type { WebSearcher } from '../../shared/ai/index.js';
import { extractJson, makeBedrockDiscoverer, makeBedrockHydrator, pickHydratableFields, type BedrockInvoker } from './ai.js';

/** Stub the shared Bedrock seam: `invoke` returns the encoded Anthropic response carrying `text`.
 *  stop_reason !== 'tool_use', so the shared loop returns immediately (no web search in tests). */
function fakeInvoker(text: string): BedrockInvoker {
  return {
    invoke: async () =>
      new TextEncoder().encode(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] })),
  };
}

const opts = (text: string) => ({ modelId: 'us.anthropic.test', invoker: fakeInvoker(text) });

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
      type: 'major-specific',
      name: 'should be ignored',
      status: 'awarded',
      awardedAmount: 9999,
      notes: 'user-owned',
    });
    expect(out).toEqual({ provider: 'ANA', amount: 5000, type: 'major-specific' });
  });
});

describe('makeBedrockDiscoverer', () => {
  it('parses model output into candidates', async () => {
    const d = makeBedrockDiscoverer(opts('[{"name":"Nurses Grant","amount":3000,"type":"major-specific"}]'));
    const out = await d.discover({ query: 'nursing' });
    expect(out).toEqual([{ name: 'Nurses Grant', amount: 3000, type: 'major-specific' }]);
  });

  it('returns [] on any failure (e.g. missing model id, never throws)', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    const d = makeBedrockDiscoverer({ invoker: fakeInvoker('[]') }); // no modelId → invoke throws → []
    await expect(d.discover({})).resolves.toEqual([]);
    if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
  });

  it('uses web_search when enabled, then parses the grounded candidates', async () => {
    let calls = 0;
    const searched: string[] = [];
    const invoker: BedrockInvoker = {
      invoke: async () => {
        calls += 1;
        if (calls === 1) {
          return new TextEncoder().encode(
            JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: { query: 'nursing scholarships 2026' } }] }),
          );
        }
        return new TextEncoder().encode(
          JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"name":"Nurses Grant","amount":3000,"type":"major-specific"}]' }] }),
        );
      },
    };
    const searcher: WebSearcher = async (q) => {
      searched.push(q);
      return [{ title: 'ANA Scholarships', url: 'https://ana.org/grants', snippet: 'Nursing grants.' }];
    };
    const d = makeBedrockDiscoverer({ modelId: 'us.anthropic.test', invoker, searcher, webSearch: true });
    const out = await d.discover({ query: 'nursing' });
    expect(out).toEqual([{ name: 'Nurses Grant', amount: 3000, type: 'major-specific' }]);
    expect(searched).toEqual(['nursing scholarships 2026']);
    expect(calls).toBe(2);
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

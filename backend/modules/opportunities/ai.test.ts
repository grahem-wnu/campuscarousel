import { describe, expect, it } from 'vitest';
import type { BedrockInvoker } from '../../shared/ai/index.js';
import { buildDiscoverPrompt, makeBedrockDiscoverer } from './ai.js';

const MODEL = 'test-model';

/** Stub the shared Bedrock seam: invoke returns the encoded Anthropic response carrying `text`,
 *  with stop_reason !== 'tool_use' so the shared loop returns immediately (no web search in tests). */
function stub(text: string): BedrockInvoker {
  return {
    invoke: async () =>
      new TextEncoder().encode(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] })),
  };
}
const throwing: BedrockInvoker = {
  invoke: async () => {
    throw new Error('ThrottlingException');
  },
};

describe('makeBedrockDiscoverer', () => {
  it('parses + validates candidates and respects the limit', async () => {
    const discover = makeBedrockDiscoverer({
      modelId: MODEL,
      invoker: stub(
        JSON.stringify([
          { name: 'Habitat Youth Build', type: 'volunteer', cost: 0 },
          { name: 'Summer Trades Academy', type: 'training-program' },
          { notName: 'dropped' }, // invalid → filtered
        ]),
      ),
    });
    const out = await discover({ limit: 2 });
    expect(out.map((c) => c.name)).toEqual(['Habitat Youth Build', 'Summer Trades Academy']);
    expect(out[0]?.type).toBe('volunteer');
  });

  it('returns [] on invoker error (endpoint never throws)', async () => {
    const discover = makeBedrockDiscoverer({ modelId: MODEL, invoker: throwing });
    expect(await discover({})).toEqual([]);
  });
});

describe('buildDiscoverPrompt major-awareness', () => {
  it('names the major and folds in pack guidance for a nursing student', () => {
    const p = buildDiscoverPrompt({}, ['Nursing']);
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('uses a generic (non-nursing) career phrase with no majors', () => {
    const p = buildDiscoverPrompt({});
    expect(p).toContain('their intended field career');
    expect(p).not.toMatch(/nursing|clinical|CNA/i);
    expect(p).not.toContain('Major-specific guidance:');
  });
});

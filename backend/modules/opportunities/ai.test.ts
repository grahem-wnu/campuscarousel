import { describe, expect, it } from 'vitest';
import type { BedrockInvoker } from '../../shared/ai/index.js';
import { makeBedrockDiscoverer } from './ai.js';

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
          { name: 'CHOC Volunteen', type: 'hospital-volunteer', cost: 0 },
          { name: 'Saddleback CNA', type: 'cna-program' },
          { notName: 'dropped' }, // invalid → filtered
        ]),
      ),
    });
    const out = await discover({ limit: 2 });
    expect(out.map((c) => c.name)).toEqual(['CHOC Volunteen', 'Saddleback CNA']);
    expect(out[0]?.type).toBe('hospital-volunteer');
  });

  it('returns [] on invoker error (endpoint never throws)', async () => {
    const discover = makeBedrockDiscoverer({ modelId: MODEL, invoker: throwing });
    expect(await discover({})).toEqual([]);
  });
});

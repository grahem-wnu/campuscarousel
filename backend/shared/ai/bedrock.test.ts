// Tool-use loop tests: the model issues a web_search tool call, we run the (injected) searcher and
// feed the tool_result back, and the model's follow-up text is returned with the sources consulted.
// Also: web search disabled, the final-round tool cutoff, and graceful degradation when search fails.

import { describe, expect, it, vi } from 'vitest';
import { converseWithSearch, type BedrockInvoker } from './bedrock.js';
import type { SearchResult, WebSearcher } from './search.js';

const MODEL = 'us.anthropic.claude-sonnet-4-6';

/** The Anthropic request body shape the loop sends (subset asserted on). */
interface CapturedRequest {
  messages: Array<{ role: string; content: unknown }>;
  tools?: Array<{ name: string }>;
  system?: string;
}

/** A content block in a captured request's message (tool_result on the follow-up turn). */
interface CapturedBlock {
  type: string;
  tool_use_id?: string;
  content?: string;
}

/** A fake Bedrock client that replays a queued list of Anthropic responses, recording the request
 *  bodies it received so the test can assert the loop wired tool_result back in. */
function fakeInvoker(responses: object[]): { invoker: BedrockInvoker; requests: CapturedRequest[] } {
  const queue = [...responses];
  const requests: CapturedRequest[] = [];
  const invoker: BedrockInvoker = {
    async invoke(_modelId: string, body: Uint8Array) {
      requests.push(JSON.parse(new TextDecoder().decode(body)) as CapturedRequest);
      const next = queue.shift() ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] };
      return new TextEncoder().encode(JSON.stringify(next));
    },
  };
  return { invoker, requests };
}

/** Read the last message's content blocks off a captured request. */
function lastUserBlocks(req: CapturedRequest): CapturedBlock[] {
  const last = req.messages.at(-1);
  return (last?.content as CapturedBlock[]) ?? [];
}

const toolUseResponse = {
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_use', id: 'tu_1', name: 'web_search', input: { query: 'UMich BSN fall-2026 deadline' } },
  ],
};
const finalResponse = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'The fall-2026 BSN deadline is February 1 [1].' }],
};

describe('converseWithSearch', () => {
  it('issues a web_search tool call, feeds tool_result back, and returns grounded text + sources', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const hits: SearchResult[] = [
      { title: 'UMich Nursing', url: 'https://umich.edu/nursing', snippet: 'Deadline Feb 1, 2026.' },
    ];
    const searcher: WebSearcher = vi.fn(async () => hits);

    const result = await converseWithSearch('When is the UMich BSN deadline?', {
      modelId: MODEL,
      webSearch: true,
      invoker,
      searcher,
    });

    expect(result.text).toMatch(/February 1/);
    expect(result.sources).toEqual(hits);
    expect(result.rounds).toBe(2);
    expect(searcher).toHaveBeenCalledWith('UMich BSN fall-2026 deadline', { maxResults: 5 });

    // First request advertised the tool; second carried the assistant turn + our tool_result.
    expect(requests[0]!.tools?.[0]?.name).toBe('web_search');
    expect(requests[1]!.messages.at(-1)!.role).toBe('user');
    const block = lastUserBlocks(requests[1]!)[0]!;
    expect(block.type).toBe('tool_result');
    expect(block.tool_use_id).toBe('tu_1');
    expect(block.content).toContain('https://umich.edu/nursing');
  });

  it('does not advertise tools when webSearch is disabled (single round, no search)', async () => {
    const { invoker, requests } = fakeInvoker([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'From my knowledge: ...' }] },
    ]);
    const searcher: WebSearcher = vi.fn(async () => []);

    const result = await converseWithSearch('hi', { modelId: MODEL, webSearch: false, invoker, searcher });

    expect(result.rounds).toBe(1);
    expect(requests[0]!.tools).toBeUndefined();
    expect(searcher).not.toHaveBeenCalled();
  });

  it('degrades when the searcher fails — feeds an unavailable result, still returns an answer', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const searcher: WebSearcher = vi.fn(async () => {
      throw new Error('no key');
    });

    const result = await converseWithSearch('q', { modelId: MODEL, webSearch: true, invoker, searcher });

    expect(result.text).toMatch(/February 1/); // model still answered
    expect(result.sources).toEqual([]);
    expect(lastUserBlocks(requests[1]!)[0]!.content).toMatch(/Search unavailable: no key/);
  });

  it('stops looping by disabling tools on the final round (guaranteed text answer)', async () => {
    // Model keeps trying to use tools; maxRounds=2 means round 2 is offered no tools -> text.
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const searcher: WebSearcher = vi.fn(async () => []);

    const result = await converseWithSearch('q', {
      modelId: MODEL,
      webSearch: true,
      maxRounds: 2,
      invoker,
      searcher,
    });

    expect(result.rounds).toBe(2);
    expect(requests[1]!.tools).toBeUndefined(); // final round: no tools offered
    expect(result.text).toMatch(/February 1/);
  });

  it('throws if no model id is configured', async () => {
    const { invoker } = fakeInvoker([]);
    await expect(
      converseWithSearch('q', { invoker, modelId: undefined, webSearch: false }),
    ).rejects.toThrow(/BEDROCK_MODEL_ID/);
  });
});

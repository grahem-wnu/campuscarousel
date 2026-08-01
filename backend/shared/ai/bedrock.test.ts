// Tool-use loop tests: the model issues a web_search tool call, we run the (injected) searcher and
// feed the tool_result back, and the model's follow-up text is returned with the sources consulted.
// Also: web search disabled, the final-round tool cutoff, and graceful degradation when search fails.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient } from '../data/index.js';
import { runWithTenant } from '../tenant/index.js';
import { converseWithSearch, type BedrockInvoker } from './bedrock.js';
import type { SearchResult, WebSearcher } from './search.js';

const MODEL = 'us.anthropic.claude-sonnet-4-6';

const FIXTURE_RATES = {
  'anthropic.claude-sonnet-4': { inputMicros: 3, outputMicros: 15, cacheReadMicros: 1, cacheWriteMicros: 4 },
};

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

const ORIGINAL_MODEL = process.env.BEDROCK_MODEL_ID;
afterEach(() => {
  if (ORIGINAL_MODEL === undefined) delete process.env.BEDROCK_MODEL_ID;
  else process.env.BEDROCK_MODEL_ID = ORIGINAL_MODEL;
});

describe('converseWithSearch', () => {
  it('records token usage per round attributed to the feature', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    const meterClient = new InMemoryTableClient();
    // A single-round Anthropic response carrying a usage block:
    const { invoker } = fakeInvoker([
      { content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 20, output_tokens: 8 } },
    ]);
    await runWithTenant('fam1', () =>
      converseWithSearch('hi', {
        feature: 'benchmark',
        webSearch: false,
        invoker,
        recordDeps: { client: meterClient, rates: FIXTURE_RATES },
      }),
    );
    const rows = await meterClient.query('T#fam1#USAGE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: 'benchmark', inputTokens: 20, outputTokens: 8 });
  });

  it('issues a web_search tool call, feeds tool_result back, and returns grounded text + sources', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const hits: SearchResult[] = [
      { title: 'UMich Nursing', url: 'https://umich.edu/nursing', snippet: 'Deadline Feb 1, 2026.' },
    ];
    const searcher: WebSearcher = vi.fn(async () => hits);

    const result = await converseWithSearch('When is the UMich BSN deadline?', {
      feature: 'benchmark',
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

    const result = await converseWithSearch('hi', { feature: 'benchmark', modelId: MODEL, webSearch: false, invoker, searcher });

    expect(result.rounds).toBe(1);
    expect(requests[0]!.tools).toBeUndefined();
    expect(searcher).not.toHaveBeenCalled();
  });

  it('degrades when the searcher fails — feeds an unavailable result, still returns an answer', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const searcher: WebSearcher = vi.fn(async () => {
      throw new Error('no key');
    });

    const result = await converseWithSearch('q', { feature: 'benchmark', modelId: MODEL, webSearch: true, invoker, searcher });

    expect(result.text).toMatch(/February 1/); // model still answered
    expect(result.sources).toEqual([]);
    expect(lastUserBlocks(requests[1]!)[0]!.content).toMatch(/Search unavailable: no key/);
  });

  it('stops looping by disabling tools on the final round (guaranteed text answer)', async () => {
    // Model keeps trying to use tools; maxRounds=2 means round 2 is offered no tools -> text.
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    const searcher: WebSearcher = vi.fn(async () => []);

    const result = await converseWithSearch('q', {
      feature: 'benchmark',
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
      converseWithSearch('q', { feature: 'benchmark', invoker, modelId: undefined, webSearch: false }),
    ).rejects.toThrow(/BEDROCK_MODEL_ID/);
  });
});

// Prompt caching. Every round re-sends the whole transcript and hydration runs up to 7 rounds, so
// the later rounds were re-paying full input price for everything the earlier ones gathered.
// college-hydrate alone was 96.5% of all AI spend, with zero cache tokens on every recorded row.
describe('converseWithSearch prompt caching', () => {
  const searcher: WebSearcher = vi.fn(async () => [
    { title: 'UMich Nursing', url: 'https://umich.edu/nursing', snippet: 'Deadline Feb 1, 2026.' },
  ]);

  /** Count every cache_control mark across a captured request. */
  function marks(req: CapturedRequest): number {
    let n = 0;
    for (const m of req.messages) {
      if (!Array.isArray(m.content)) continue;
      for (const b of m.content as Array<{ cache_control?: unknown }>) if (b.cache_control) n += 1;
    }
    return n;
  }

  it('marks a breakpoint at the end of the transcript while tools are still offered', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    await converseWithSearch('When is the UMich BSN deadline?', {
      feature: 'college-hydrate', modelId: MODEL, invoker, searcher, webSearch: true, maxRounds: 3,
    });
    // Round 1 offers tools → the bare-string prompt is normalized to blocks and the tail is marked.
    const first = lastUserBlocks(requests[0]!) as Array<{ cache_control?: unknown }>;
    expect(first.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('keeps at most ONE breakpoint — Anthropic caps them at 4 and hydration runs 7 rounds', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, toolUseResponse, finalResponse]);
    await converseWithSearch('q', {
      feature: 'college-hydrate', modelId: MODEL, invoker, searcher, webSearch: true, maxRounds: 5,
    });
    for (const req of requests) expect(marks(req)).toBeLessThanOrEqual(1);
  });

  it('moves the breakpoint forward as the transcript grows', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, toolUseResponse, finalResponse]);
    await converseWithSearch('q', {
      feature: 'college-hydrate', modelId: MODEL, invoker, searcher, webSearch: true, maxRounds: 5,
    });
    // Round 2's mark sits on the newest tool_result turn, not back on the original prompt.
    const second = lastUserBlocks(requests[1]!) as Array<{ type: string; cache_control?: unknown }>;
    expect(second.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    expect(second.at(-1)?.type).toBe('tool_result');
  });

  // Cost trap: the final round drops `tools`, which changes the front of the prompt and invalidates
  // the cached prefix. A breakpoint there buys nothing and still bills the 1.25x write on the run's
  // LARGEST transcript.
  it('strips the breakpoint on the final round, where tools are withdrawn', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    await converseWithSearch('q', {
      feature: 'college-hydrate', modelId: MODEL, invoker, searcher, webSearch: true, maxRounds: 2,
    });
    expect(requests[1]!.tools).toBeUndefined();
    expect(marks(requests[1]!)).toBe(0);
  });

  // Cost trap: with search off there is only ever one round, so nothing would ever read the cache —
  // marking it would be a pure 25% surcharge on input.
  it('does not cache when web search is disabled', async () => {
    const { invoker, requests } = fakeInvoker([finalResponse]);
    await converseWithSearch('q', {
      feature: 'focus', modelId: MODEL, invoker, searcher, webSearch: false,
    });
    expect(marks(requests[0]!)).toBe(0);
  });

  it('can be opted out per feature', async () => {
    const { invoker, requests } = fakeInvoker([toolUseResponse, finalResponse]);
    await converseWithSearch('q', {
      feature: 'focus', modelId: MODEL, invoker, searcher, webSearch: true, maxRounds: 3, cache: false,
    });
    for (const req of requests) expect(marks(req)).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BedrockInvoker, WebSearcher } from '../../shared/ai/index.js';
import { makeWebGroundedInvoker } from './bedrock.js';

const MODEL = 'us.anthropic.test';
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const textRes = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
const toolUse = (query: string) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: { query } }],
});

let prevModel: string | undefined;
beforeEach(() => {
  prevModel = process.env.BEDROCK_MODEL_ID;
  process.env.BEDROCK_MODEL_ID = MODEL;
});
afterEach(() => {
  if (prevModel !== undefined) process.env.BEDROCK_MODEL_ID = prevModel;
  else delete process.env.BEDROCK_MODEL_ID;
});

describe('makeWebGroundedInvoker', () => {
  it('returns the model text directly when web search is off', async () => {
    const invoker: BedrockInvoker = { invoke: async () => enc(textRes('avg admitted GPA ~3.6')) };
    const invoke = makeWebGroundedInvoker({ invoker });
    expect(await invoke('typical BSN benchmarks?')).toBe('avg admitted GPA ~3.6');
  });

  it('uses web_search when enabled, then returns the grounded text', async () => {
    let calls = 0;
    const searched: string[] = [];
    const invoker: BedrockInvoker = {
      invoke: async () => {
        calls += 1;
        return calls === 1 ? enc(toolUse('typical BSN admit GPA TEAS')) : enc(textRes('avg GPA 3.7, TEAS 80'));
      },
    };
    const searcher: WebSearcher = async (q) => {
      searched.push(q);
      return [{ title: 'BSN admit data', url: 'https://example.edu/bsn', snippet: 'GPA 3.7' }];
    };
    const invoke = makeWebGroundedInvoker({ invoker, searcher, webSearch: true });
    expect(await invoke('research benchmarks')).toBe('avg GPA 3.7, TEAS 80');
    expect(searched).toEqual(['typical BSN admit GPA TEAS']); // searcher actually consulted
    expect(calls).toBe(2);
  });
});

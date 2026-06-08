import { describe, expect, it } from 'vitest';
import type { WebSearcher } from '../../shared/ai/index.js';
import {
  extractJson,
  makeBedrockDiscoverer,
  makeBedrockHydrator,
  pickHydratableFields,
  type BedrockInvoker,
} from './ai.js';

const MODEL = 'us.anthropic.test-model';

/** Stub the shared Bedrock seam: its `invoke` returns the encoded Anthropic response carrying
 *  `text`. stop_reason !== 'tool_use', so the shared loop returns immediately (no web search in
 *  tests — AI_WEB_SEARCH is unset). */
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

describe('extractJson', () => {
  it('extracts an object, an array, and tolerates code fences / prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
    expect(extractJson('Here you go:\n```json\n[{"name":"X"}]\n```')).toEqual([{ name: 'X' }]);
  });

  it('throws when there is no JSON', () => {
    expect(() => extractJson('sorry, no data')).toThrow();
  });
});

describe('pickHydratableFields', () => {
  it('keeps allowlisted fields and drops ids/status/unknowns/nulls', () => {
    const out = pickHydratableFields({
      collegeId: 'hacker',
      status: 'accepted', // user/system-owned — must NOT be set by hydration
      isTopPick: true, // user-owned
      bogus: 'x',
      location: 'Columbus, OH',
      tuitionInState: 12000,
      website: null, // null dropped
      ranking: 'Top 50',
    });
    expect(out).toEqual({ location: 'Columbus, OH', tuitionInState: 12000, ranking: 'Top 50' });
  });

  it('keeps the new narrative + financial fields', () => {
    const out = pickHydratableFields({
      overview: 'A distinctive program.',
      admissionsDeepDive: 'Two pathways.',
      nclexPassRate: '94%',
      estimatedNetPriceAfterAid: 45984,
      costOfAttendanceOutOfState: 58860,
      dataAsOf: '2025-2026',
    });
    expect(out).toEqual({
      overview: 'A distinctive program.',
      admissionsDeepDive: 'Two pathways.',
      nclexPassRate: '94%',
      estimatedNetPriceAfterAid: 45984,
      costOfAttendanceOutOfState: 58860,
      dataAsOf: '2025-2026',
    });
  });

  it('cleans testimonials (drops quote-less), image URLs, and source URLs', () => {
    const out = pickHydratableFields({
      testimonials: [
        { quote: 'I loved the clinicals.', attribution: 'BSN student', source: 'https://niche.com/x' },
        { attribution: 'no quote — dropped' },
        'not an object — dropped',
      ],
      campusImageUrls: ['https://cdn.osu.edu/a.jpg', 'not-a-url', 'ftp://nope'],
      dataSources: ['https://nursing.osu.edu', 'garbage'],
    });
    expect(out.testimonials).toEqual([
      { quote: 'I loved the clinicals.', attribution: 'BSN student', source: 'https://niche.com/x' },
    ]);
    expect(out.campusImageUrls).toEqual(['https://cdn.osu.edu/a.jpg']);
    expect(out.dataSources).toEqual(['https://nursing.osu.edu']);
  });

  it('drops structured fields entirely when nothing survives cleaning', () => {
    const out = pickHydratableFields({ testimonials: [{ attribution: 'x' }], campusImageUrls: ['nope'] });
    expect(out).toEqual({});
  });
});

describe('makeBedrockDiscoverer', () => {
  it('parses + validates candidates and respects the limit', async () => {
    const discover = makeBedrockDiscoverer({
      modelId: MODEL,
      invoker: stub(
        JSON.stringify([
          { name: 'Ohio State', state: 'Ohio', programType: 'direct-admit-BSN', tuitionInState: 12000 },
          { name: 'Indiana U', state: 'Indiana' },
          { notName: 'dropped' }, // invalid → filtered
        ]),
      ),
    });
    const out = await discover({ limit: 2 });
    expect(out.map((c) => c.name)).toEqual(['Ohio State', 'Indiana U']);
    expect(out[0]?.programType).toBe('direct-admit-BSN');
  });

  it('returns [] when the model output is not an array', async () => {
    const discover = makeBedrockDiscoverer({ modelId: MODEL, invoker: stub('{"oops":true}') });
    expect(await discover({})).toEqual([]);
  });

  it('uses web_search when enabled, then parses the grounded answer', async () => {
    let calls = 0;
    const searched: string[] = [];
    // Round 1: the model asks to web_search. Round 2: it returns the grounded JSON.
    const invoker: BedrockInvoker = {
      invoke: async () => {
        calls += 1;
        if (calls === 1) {
          return new TextEncoder().encode(
            JSON.stringify({
              stop_reason: 'tool_use',
              content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: { query: 'direct-admit BSN Ohio' } }],
            }),
          );
        }
        return new TextEncoder().encode(
          JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify([{ name: 'Ohio State', state: 'Ohio' }]) }] }),
        );
      },
    };
    const searcher: WebSearcher = async (q) => {
      searched.push(q);
      return [{ title: 'OSU Nursing', url: 'https://osu.edu/nursing', snippet: 'Direct-admit BSN.' }];
    };
    const discover = makeBedrockDiscoverer({ modelId: MODEL, invoker, searcher, webSearch: true });
    const out = await discover({ state: 'Ohio' });
    expect(out.map((c) => c.name)).toEqual(['Ohio State']);
    expect(searched).toEqual(['direct-admit BSN Ohio']); // the searcher was actually consulted
    expect(calls).toBe(2);
  });

  it('returns [] on client error and when no model id is configured', async () => {
    expect(await makeBedrockDiscoverer({ modelId: MODEL, invoker: throwing })({})).toEqual([]);
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      expect(await makeBedrockDiscoverer({ invoker: stub('[]') })({})).toEqual([]);
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

describe('makeBedrockHydrator', () => {
  it('returns allowlisted fields + hydrationStatus complete on success', async () => {
    const hydrate = makeBedrockHydrator({
      modelId: MODEL,
      invoker: stub(JSON.stringify({ location: 'Columbus, OH', status: 'accepted', tuitionInState: 12000 })),
    });
    const out = await hydrate({ name: 'Ohio State' });
    expect(out).toEqual({ location: 'Columbus, OH', tuitionInState: 12000, hydrationStatus: 'complete' });
    expect(out).not.toHaveProperty('status'); // hydration never sets user/system fields
  });

  it('returns hydrationStatus failed on any error', async () => {
    const hydrate = makeBedrockHydrator({ modelId: MODEL, invoker: throwing });
    expect(await hydrate({ name: 'Ohio State' })).toEqual({ hydrationStatus: 'failed' });
  });

  it('folds the URLs it actually searched into dataSources (deduped with model-listed)', async () => {
    let calls = 0;
    // Round 1: model asks to web_search. Round 2: it returns JSON citing one source itself.
    const invoker: BedrockInvoker = {
      invoke: async () => {
        calls += 1;
        if (calls === 1) {
          return new TextEncoder().encode(
            JSON.stringify({
              stop_reason: 'tool_use',
              content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: { query: 'OSU net price' } }],
            }),
          );
        }
        return new TextEncoder().encode(
          JSON.stringify({
            stop_reason: 'end_turn',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  overview: 'Top-ranked.',
                  estimatedNetPriceAfterAid: 45984,
                  dataSources: ['https://nursing.osu.edu'], // also surfaces below as a consulted URL
                }),
              },
            ],
          }),
        );
      },
    };
    const searcher: WebSearcher = async () => [
      { title: 'OSU Nursing', url: 'https://nursing.osu.edu', snippet: 'net price' },
      { title: 'College Navigator', url: 'https://nces.ed.gov/osu', snippet: 'aid' },
    ];
    const hydrate = makeBedrockHydrator({ modelId: MODEL, invoker, searcher, webSearch: true });
    const out = await hydrate({ name: 'Ohio State' });
    expect(out.hydrationStatus).toBe('complete');
    expect(out.overview).toBe('Top-ranked.');
    expect(out.estimatedNetPriceAfterAid).toBe(45984);
    // model-listed first, consulted appended, deduped (nursing.osu.edu appears once).
    expect(out.dataSources).toEqual(['https://nursing.osu.edu', 'https://nces.ed.gov/osu']);
  });
});

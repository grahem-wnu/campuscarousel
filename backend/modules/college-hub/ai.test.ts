import { describe, expect, it } from 'vitest';
import {
  extractJson,
  makeBedrockDiscoverer,
  makeBedrockHydrator,
  pickHydratableFields,
  type BedrockInvoker,
} from './ai.js';

const MODEL = 'us.anthropic.test-model';

/** Stub Bedrock client whose response carries `text` as the assistant message. */
function stub(text: string): BedrockInvoker {
  return {
    send: async () => ({
      body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })),
    }),
  };
}
const throwing: BedrockInvoker = {
  send: async () => {
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
});

describe('makeBedrockDiscoverer', () => {
  it('parses + validates candidates and respects the limit', async () => {
    const discover = makeBedrockDiscoverer({
      modelId: MODEL,
      client: stub(
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
    const discover = makeBedrockDiscoverer({ modelId: MODEL, client: stub('{"oops":true}') });
    expect(await discover({})).toEqual([]);
  });

  it('returns [] on client error and when no model id is configured', async () => {
    expect(await makeBedrockDiscoverer({ modelId: MODEL, client: throwing })({})).toEqual([]);
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      expect(await makeBedrockDiscoverer({ client: stub('[]') })({})).toEqual([]);
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

describe('makeBedrockHydrator', () => {
  it('returns allowlisted fields + hydrationStatus complete on success', async () => {
    const hydrate = makeBedrockHydrator({
      modelId: MODEL,
      client: stub(JSON.stringify({ location: 'Columbus, OH', status: 'accepted', tuitionInState: 12000 })),
    });
    const out = await hydrate({ name: 'Ohio State' });
    expect(out).toEqual({ location: 'Columbus, OH', tuitionInState: 12000, hydrationStatus: 'complete' });
    expect(out).not.toHaveProperty('status'); // hydration never sets user/system fields
  });

  it('returns hydrationStatus failed on any error', async () => {
    const hydrate = makeBedrockHydrator({ modelId: MODEL, client: throwing });
    expect(await hydrate({ name: 'Ohio State' })).toEqual({ hydrationStatus: 'failed' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { extractJson, makeBedrockExperienceFinder, makeBedrockReviewer, type BedrockInvoker } from './ai.js';
import type { ExperienceCandidate } from './experiences.js';

function fakeClient(text: string): BedrockInvoker {
  const send = vi.fn(async (_c: unknown) => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }] })),
  }));
  return { send } as BedrockInvoker;
}
const opts = (text: string) => ({ modelId: 'us.anthropic.test', client: fakeClient(text) });

const candidates: ExperienceCandidate[] = [
  { source: 'activity', id: 'a1', title: 'Volunteer', text: 'helped', visibility: 'family' },
  { source: 'why-nursing', id: 'w1', title: 'Spark', text: 'the moment', visibility: 'private' },
];

describe('extractJson', () => {
  it('extracts JSON from fenced prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('makeBedrockExperienceFinder', () => {
  it('resolves selected keys back to the candidates passed in and keeps angles', async () => {
    const find = makeBedrockExperienceFinder(
      opts('{"experiences":[{"key":"why-nursing:w1","why":"core moment"}],"angles":["resilience"]}'),
    );
    const out = await find({ candidates });
    expect(out.experiences).toEqual([{ source: 'why-nursing', id: 'w1', title: 'Spark', why: 'core moment' }]);
    expect(out.angles).toEqual(['resilience']);
  });

  it('drops hallucinated keys not in the candidate set', async () => {
    const find = makeBedrockExperienceFinder(opts('{"experiences":[{"key":"activity:DOES-NOT-EXIST","why":"x"}],"angles":[]}'));
    expect((await find({ candidates })).experiences).toEqual([]);
  });

  it('returns empty suggestions on malformed output (never throws)', async () => {
    const find = makeBedrockExperienceFinder(opts('the model rambled'));
    await expect(find({ candidates })).resolves.toEqual({ experiences: [], angles: [] });
  });
});

describe('makeBedrockReviewer', () => {
  it('returns structured feedback and never a rewrite', async () => {
    const review = makeBedrockReviewer(
      opts('{"strengths":["voice"],"suggestions":["cut adverbs"],"authenticity":"real","structure":"tight","rewrite":"IGNORED"}'),
    );
    const fb = await review({ content: 'draft' });
    expect(fb).toEqual({ strengths: ['voice'], suggestions: ['cut adverbs'], authenticity: 'real', structure: 'tight' });
    expect(fb).not.toHaveProperty('rewrite'); // the allowlist drops any rewritten prose
  });

  it('returns empty feedback on failure', async () => {
    const review = makeBedrockReviewer(opts('no json'));
    await expect(review({ content: 'x' })).resolves.toEqual({ strengths: [], suggestions: [], authenticity: '', structure: '' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildBriefPrompt,
  buildFindPrompt,
  curatedEssayReviewer,
  curatedExperienceFinder,
  extractJson,
  makeBedrockEssayReviewer,
  makeBedrockExperienceFinder,
  wordCountOf,
  type BedrockInvoker,
} from './ai.js';
import type { ExperiencePool } from './grounding.js';

const MODEL = 'us.anthropic.test-model';
function stub(text: string): BedrockInvoker {
  return { send: async () => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) }) };
}
const throwing: BedrockInvoker = { send: async () => { throw new Error('Throttle'); } };

const pool: ExperiencePool = {
  experiences: [
    { kind: 'experience', date: '2026-02-01', title: 'County Hospital', detail: 'shadowed an ICU professional' },
    { kind: 'motivation', date: '2026-03-01', title: 'A moment with Marcus', detail: 'soup kitchen conversation' },
  ],
  includesPrivate: false,
  counts: { activities: 0, experiences: 1, motivations: 1 },
};

describe('extractJson / wordCountOf', () => {
  it('extracts JSON and counts words', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(wordCountOf('  one  two three ')).toBe(3);
  });
});

describe('major-aware prompts', () => {
  it('essay-brainstorm names the major and folds in pack guidance', () => {
    const p = buildFindPrompt({ prompt: 'Why this field?', pool, majors: ['Nursing'] });
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('recommender-brief names the major and folds in pack guidance', () => {
    const p = buildBriefPrompt({ slot: 'stem-teacher', pool, majors: ['Nursing'] });
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('stays neutral with no majors', () => {
    const p = buildFindPrompt({ prompt: 'p', pool });
    expect(p).toContain('their intended college program');
    expect(p).not.toContain('Major-specific guidance:');
  });
});

describe('curatedExperienceFinder', () => {
  it('suggests from the pool with angles', async () => {
    const r = await curatedExperienceFinder({ prompt: 'Why nursing?', pool });
    expect(r.source).toBe('curated');
    expect(r.suggestedExperiences[0]?.title).toBe('County Hospital');
    expect(r.angles.length).toBeGreaterThan(0);
  });
});

describe('curatedEssayReviewer — never rewrites', () => {
  it('gives feedback + word count + onTarget, with rewrote=false', async () => {
    const short = await curatedEssayReviewer({ prompt: 'p', content: 'Too short.', targetWords: 500 });
    expect(short.rewrote).toBe(false);
    expect(short.onTarget).toBe(false);
    expect(short.improvements.length).toBeGreaterThan(0);
    expect(short.wordCount).toBe(2);
  });
});

describe('makeBedrockExperienceFinder', () => {
  it('parses model output and falls back on failure', { timeout: 30000 }, async () => {
    const finder = makeBedrockExperienceFinder({ modelId: MODEL, client: stub(JSON.stringify({ suggestedExperiences: [{ title: 'County Hospital', kind: 'experience', why: 'vivid' }], angles: ['open with a scene'] })) });
    const r = await finder({ prompt: 'p', pool });
    expect(r.source).toBe('ai');
    expect(r.suggestedExperiences[0]?.title).toBe('County Hospital');
    expect((await makeBedrockExperienceFinder({ modelId: MODEL, client: throwing })({ prompt: 'p', pool })).source).toBe('curated');
  });
});

describe('makeBedrockEssayReviewer', () => {
  it('uses model output (still rewrote=false) and falls back on failure', { timeout: 30000 }, async () => {
    const ok = makeBedrockEssayReviewer({ modelId: MODEL, client: stub(JSON.stringify({ strengths: ['vivid'], improvements: ['cut clichés'], authenticity: 'sounds like you' })) });
    const r = await ok({ prompt: 'p', content: 'A reasonably long essay draft with several words in it.' });
    expect(r.source).toBe('ai');
    expect(r.rewrote).toBe(false);
    expect((await makeBedrockEssayReviewer({ modelId: MODEL, client: throwing })({ prompt: 'p', content: 'x' })).source).toBe('curated');
  });
});

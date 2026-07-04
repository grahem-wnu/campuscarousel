import { describe, expect, it } from 'vitest';
import {
  buildBriefPrompt,
  buildFindPrompt,
  buildPracticePrompt,
  buildReviewPrompt,
  curatedEssayReviewer,
  curatedExperienceFinder,
  curatedPracticeQuestions,
  extractJson,
  makeBedrockEssayReviewer,
  makeBedrockExperienceFinder,
  makeBedrockPracticeQuestions,
  parseRatings,
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

// ---- Essay coach upgrade: college grounding, rubric rating, practice questions ----

const college = {
  collegeId: 'osu',
  name: 'Ohio State',
  overview: 'Big-ten flagship with a direct-admit BSN.',
  admissionsDeepDive: 'Holistic direct admit; essays carry real weight.',
  essayPrompts: ['Why OSU nursing?'],
  competitiveEdges: ['200+ clinical hours'],
};

describe('college-aware prompts', () => {
  it('find prompt folds in the target college and the coach guardrail', () => {
    const p = buildFindPrompt({ prompt: 'Why this field?', pool, college });
    expect(p).toContain('Target college: Ohio State');
    expect(p).toContain('what this school values');
    expect(p).toContain('never draft sentences');
  });

  it('review prompt asks for collegeFit only when a college is linked', () => {
    const withCollege = buildReviewPrompt({ prompt: 'p', content: 'draft', college });
    expect(withCollege).toContain('"collegeFit": number');
    expect(withCollege).toContain('Target college: Ohio State');
    const without = buildReviewPrompt({ prompt: 'p', content: 'draft' });
    expect(without).not.toContain('"collegeFit"');
    expect(without).toContain('never rewrite the essay');
  });
});

describe('parseRatings', () => {
  it('accepts a full rubric, rounds, and keeps collegeFit only when expected', () => {
    expect(parseRatings({ promptFit: 7.4, voice: 8, structure: 6, specificity: 5, collegeFit: 9 }, true))
      .toEqual({ promptFit: 7, voice: 8, structure: 6, specificity: 5, collegeFit: 9 });
    expect(parseRatings({ promptFit: 7, voice: 8, structure: 6, specificity: 5, collegeFit: 9 }, false))
      .toEqual({ promptFit: 7, voice: 8, structure: 6, specificity: 5 });
  });

  it('rejects incomplete or out-of-range rubrics', () => {
    expect(parseRatings({ promptFit: 7, voice: 8, structure: 6 }, false)).toBeUndefined();
    expect(parseRatings({ promptFit: 0, voice: 8, structure: 6, specificity: 5 }, false)).toBeUndefined();
    expect(parseRatings(undefined, false)).toBeUndefined();
  });
});

describe('rated review', () => {
  const rated = JSON.stringify({
    strengths: ['vivid opening'],
    improvements: ['tighten middle'],
    authenticity: 'sounds like you',
    ratings: { promptFit: 8, voice: 9, structure: 7, specificity: 8, collegeFit: 7 },
    overall: 8,
    verdict: 'close',
  });

  it('parses ratings, overall, and verdict from the AI path', async () => {
    const review = await makeBedrockEssayReviewer({ modelId: MODEL, client: stub(rated) })({ prompt: 'p', content: 'a b c', college });
    expect(review.source).toBe('ai');
    expect(review.ratings).toMatchObject({ promptFit: 8, collegeFit: 7 });
    expect(review.overall).toBe(8);
    expect(review.verdict).toBe('close');
    expect(review.rewrote).toBe(false);
  });

  it('still returns feedback when the model omits or garbles the rubric', async () => {
    const noRubric = JSON.stringify({ strengths: ['s'], improvements: ['i'], authenticity: 'a', ratings: { promptFit: 99 }, overall: 'x', verdict: 'meh' });
    const review = await makeBedrockEssayReviewer({ modelId: MODEL, client: stub(noRubric) })({ prompt: 'p', content: 'a b c' });
    expect(review.strengths).toEqual(['s']);
    expect(review.ratings).toBeUndefined();
    expect(review.overall).toBeUndefined();
    expect(review.verdict).toBeUndefined();
  });

  it('curated fallback never fakes scores', async () => {
    const review = await curatedEssayReviewer({ prompt: 'p', content: 'short draft' });
    expect(review.ratings).toBeUndefined();
    expect(review.overall).toBeUndefined();
    expect(review.verdict).toBeUndefined();
  });
});

describe('practice questions', () => {
  it('prompt writes in the college style when linked, Common-App style otherwise', () => {
    const withCollege = buildPracticePrompt({ college, count: 5 });
    expect(withCollege).toContain("THIS school's authentic style");
    expect(withCollege).toContain('Target college: Ohio State');
    const without = buildPracticePrompt({ count: 5 });
    expect(without).toContain('Common-App-style');
    expect(without).toContain('never sample essay text');
  });

  it('parses AI questions and clamps count', async () => {
    const payload = JSON.stringify({ questions: Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, why: 'w', tip: 't' })) });
    const gen = makeBedrockPracticeQuestions({ modelId: MODEL, client: stub(payload) });
    const r = await gen({ college, count: 4 });
    expect(r.source).toBe('ai');
    expect(r.questions).toHaveLength(4);
    expect(r.questions[0]).toEqual({ question: 'Q0', why: 'w', tip: 't' });
  });

  it('falls back to curated questions on model failure, front-loading real college prompts', async () => {
    const gen = makeBedrockPracticeQuestions({ modelId: MODEL, client: throwing });
    const r = await gen({ college, count: 5 });
    expect(r.source).toBe('curated');
    expect(r.questions[0]?.question).toBe('Why OSU nursing?');
    expect(r.questions).toHaveLength(5);
  });

  it('curated set works with no college at all', async () => {
    const r = await curatedPracticeQuestions({ count: 3 });
    expect(r.questions).toHaveLength(3);
    expect(r.source).toBe('curated');
  });
});

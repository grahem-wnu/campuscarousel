import { describe, expect, it } from 'vitest';
import {
  curatedFeedbackGenerator,
  curatedQuestionGenerator,
  extractJson,
  makeBedrockFeedbackGenerator,
  makeBedrockQuestionGenerator,
  type BedrockInvoker,
} from './ai.js';
import type { GroundingContext } from './grounding.js';

const MODEL = 'us.anthropic.test-model';
function stub(text: string): BedrockInvoker {
  return { send: async () => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) }) };
}
const throwing: BedrockInvoker = { send: async () => { throw new Error('Throttle'); } };

const grounding: GroundingContext = {
  experiences: [
    { kind: 'clinical', date: '2026-02-01', title: 'County Hospital', detail: 'shadowed an ICU nurse' },
    { kind: 'activity', date: '2026-01-01', title: 'Hospice volunteering', detail: 'comforted families' },
  ],
  counts: { activities: 1, clinical: 1, whyNursing: 0 },
  includesPrivate: false,
};

describe('extractJson', () => {
  it('extracts array/object tolerating fences', () => {
    expect(extractJson('```json\n[{"question":"Q"}]\n```')).toEqual([{ question: 'Q' }]);
    expect(() => extractJson('nope')).toThrow();
  });
});

describe('curatedQuestionGenerator', () => {
  it('returns count questions, starred-first, with a school-specific opener when given a school', async () => {
    const qs = await curatedQuestionGenerator({ count: 4, grounding, school: 'Ohio State' });
    expect(qs).toHaveLength(4);
    expect(qs[0]?.category).toBe('school-specific');
    expect(qs[0]?.question).toMatch(/Ohio State/);
  });
});

describe('curatedFeedbackGenerator', () => {
  it('rates higher for a developed answer that cites an experience', async () => {
    const weak = await curatedFeedbackGenerator({ question: 'Why nursing?', answer: 'I like it.', grounding });
    const strong = await curatedFeedbackGenerator({
      question: 'Why nursing?',
      answer: 'At County Hospital I shadowed an ICU nurse for many weeks and learned how much I value patient advocacy, which is why I want to pursue critical care nursing and keep growing in high-acuity settings.',
      grounding,
    });
    expect(strong.rating).toBeGreaterThan(weak.rating);
    expect(strong.references[0]).toMatch(/County Hospital/);
    expect(weak.improvements.length).toBeGreaterThan(0);
  });
});

describe('makeBedrockQuestionGenerator', () => {
  it('parses model output and falls back on failure', async () => {
    const gen = makeBedrockQuestionGenerator({ modelId: MODEL, client: stub(JSON.stringify([{ question: 'Tell me about a team conflict.', category: 'behavioral' }])) });
    const qs = await gen({ count: 3, grounding });
    expect(qs[0]).toEqual({ question: 'Tell me about a team conflict.', category: 'behavioral' });
    expect((await makeBedrockQuestionGenerator({ modelId: MODEL, client: throwing })({ count: 3, grounding })).length).toBeGreaterThan(0); // curated
  });
});

describe('makeBedrockFeedbackGenerator', () => {
  it('uses model output on success and falls back on failure', async () => {
    const ok = makeBedrockFeedbackGenerator({ modelId: MODEL, client: stub(JSON.stringify({ strengths: ['clear'], improvements: ['add detail'], suggestions: ['STAR'], rating: 4, references: ['County Hospital'] })) });
    const fb = await ok({ question: 'Q', answer: 'A', grounding });
    expect(fb.source).toBe('ai');
    expect(fb.rating).toBe(4);
    expect((await makeBedrockFeedbackGenerator({ modelId: MODEL, client: throwing })({ question: 'Q', answer: 'A', grounding })).source).toBe('curated');
  });
});

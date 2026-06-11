import { describe, expect, it } from 'vitest';
import {
  curatedSuggester,
  makeBedrockSuggester,
  type BedrockInvoker,
} from './suggester.js';

const names = (list: { name: string }[]): string[] => list.map((s) => s.name);

/** Build a stub Bedrock client whose response carries `modelArray` as the assistant's text. */
function stubClient(text: string): BedrockInvoker {
  return {
    send: async () => ({
      body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text }] })),
    }),
  };
}

const asJson = (arr: unknown): string => JSON.stringify(arr);

describe('curatedSuggester', () => {
  it('returns no hardcoded certs in the generic core (program packs supply their own)', async () => {
    const out = await curatedSuggester({ careerGoal: 'a college-bound student', existingNames: [] });
    expect(out).toEqual([]);
  });

  it('returns empty regardless of the goal or held certs (no major pack)', async () => {
    expect(await curatedSuggester({ careerGoal: 'biology major', existingNames: [] })).toEqual([]);
    expect(await curatedSuggester({ careerGoal: 'engineering', existingNames: ['First Aid'] })).toEqual([]);
  });

  it('surfaces a major pack baseline: a nursing major yields CNA/BLS, minus what is held', async () => {
    const out = await curatedSuggester({ careerGoal: 'nurse', existingNames: [], majors: ['Nursing'] });
    expect(names(out).some((n) => /BLS/.test(n))).toBe(true);
    expect(names(out).some((n) => /CNA|Certified Nursing Assistant/.test(n))).toBe(true);
    // held certs are filtered out
    const held = await curatedSuggester({ careerGoal: 'nurse', existingNames: ['BLS'], majors: ['Nursing'] });
    expect(names(held).some((n) => /BLS/.test(n))).toBe(false);
  });
});

describe('makeBedrockSuggester', () => {
  const modelId = 'us.anthropic.test-model';

  it('parses, validates, dedupes, and priority-sorts the model output', async () => {
    const client = stubClient(
      asJson([
        { name: 'EKG Technician', why: 'Useful for ICU monitoring.', typicalCost: 800, priority: 2 },
        { name: 'ACLS', why: 'Critical care core.', typicalCost: 250, priority: 1 },
        { name: 'BLS/CPR', why: 'Already held — should be dropped.', priority: 3 }, // held → filtered
        { why: 'no name — dropped', priority: 4 }, // invalid → dropped
      ]),
    );
    const suggest = makeBedrockSuggester({ modelId, client });
    const out = await suggest({ careerGoal: 'ICU nurse', existingNames: ['BLS/CPR Certification'] });
    expect(names(out)).toEqual(['ACLS', 'EKG Technician']); // sorted by priority, held/invalid removed
  });

  it('falls back to the (empty) curated list when the model returns no parseable array', async () => {
    const suggest = makeBedrockSuggester({ modelId, client: stubClient('Sorry, I cannot help.') });
    const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
    expect(out).toEqual([]);
  });

  it('falls back to the (empty) curated list when the model returns an empty array', async () => {
    const suggest = makeBedrockSuggester({ modelId, client: stubClient(asJson([])) });
    const out = await suggest({ careerGoal: 'become a nurse', existingNames: [] });
    expect(out).toEqual([]);
  });

  it('falls back to the (empty) curated list when the client throws (timeout/throttle)', async () => {
    const throwing: BedrockInvoker = {
      send: async () => {
        throw new Error('ThrottlingException');
      },
    };
    const suggest = makeBedrockSuggester({ modelId, client: throwing });
    const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
    expect(out).toEqual([]);
  });

  it('falls back to the (empty) curated list when no model id is configured (env unset, none passed)', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      const suggest = makeBedrockSuggester({ client: stubClient(asJson([{ name: 'X', why: 'y' }])) });
      const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
      expect(out).toEqual([]); // curated empty, not the stub's "X"
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

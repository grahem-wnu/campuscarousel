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
  it('returns the baseline certs for a generic nursing goal, ordered by priority', async () => {
    const out = await curatedSuggester({ careerGoal: 'become a nurse', existingNames: [] });
    expect(names(out)).toContain('BLS/CPR Certification');
    expect(names(out)).toContain('Certified Nursing Assistant (CNA)');
    expect(names(out)).toContain('First Aid Certification');
    expect(names(out)).toContain('Stop the Bleed');
    // sorted ascending by priority
    const priorities = out.map((s) => s.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('adds the ICU/critical-care track when the goal mentions ICU', async () => {
    const out = await curatedSuggester({ careerGoal: 'ICU nurse in critical care', existingNames: [] });
    expect(names(out)).toContain('Advanced Cardiovascular Life Support (ACLS)');
    expect(names(out)).toContain('Pediatric Advanced Life Support (PALS)');
  });

  it('does NOT add the ICU track for an unrelated goal', async () => {
    const out = await curatedSuggester({ careerGoal: 'school nurse', existingNames: [] });
    expect(names(out)).not.toContain('Advanced Cardiovascular Life Support (ACLS)');
  });

  it('filters out certs Keira already holds (case-insensitive, alias-aware)', async () => {
    const out = await curatedSuggester({
      careerGoal: 'ICU nurse',
      existingNames: ['bls/cpr certification', 'ACLS', 'Certified Nursing Assistant'],
    });
    expect(names(out)).not.toContain('BLS/CPR Certification');
    expect(names(out)).not.toContain('Advanced Cardiovascular Life Support (ACLS)');
    expect(names(out)).not.toContain('Certified Nursing Assistant (CNA)');
    expect(names(out)).toContain('First Aid Certification');
  });

  it('does NOT over-filter on blank / generic / unrelated held names', async () => {
    // A blank name, an all-stopword name, and an unrelated cert must not suppress the baseline.
    const out = await curatedSuggester({
      careerGoal: 'become a nurse',
      existingNames: ['', '   ', 'Certification', 'Hepatitis B Vaccination Record'],
    });
    expect(names(out)).toEqual(
      expect.arrayContaining([
        'BLS/CPR Certification',
        'Certified Nursing Assistant (CNA)',
        'First Aid Certification',
        'Stop the Bleed',
      ]),
    );
  });

  it('an unrelated held cert does not cross-match a different suggestion', async () => {
    const out = await curatedSuggester({ careerGoal: 'ICU nurse', existingNames: ['BLS/CPR'] });
    // Holding BLS/CPR must not suppress ACLS/PALS (no shared significant token).
    expect(names(out)).toContain('Advanced Cardiovascular Life Support (ACLS)');
    expect(names(out)).toContain('Pediatric Advanced Life Support (PALS)');
  });

  it('does not leak internal alias fields to the API shape', async () => {
    const out = await curatedSuggester({ careerGoal: 'ICU nurse', existingNames: [] });
    for (const s of out) expect(s).not.toHaveProperty('aliases');
  });

  it('every suggestion carries a rationale', async () => {
    const out = await curatedSuggester({ careerGoal: 'ICU nurse', existingNames: [] });
    for (const s of out) expect(s.why.length).toBeGreaterThan(0);
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

  it('falls back to curated when the model returns no parseable array', async () => {
    const suggest = makeBedrockSuggester({ modelId, client: stubClient('Sorry, I cannot help.') });
    const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
    expect(names(out)).toContain('BLS/CPR Certification');
  });

  it('falls back to curated when the model returns an empty array', async () => {
    const suggest = makeBedrockSuggester({ modelId, client: stubClient(asJson([])) });
    const out = await suggest({ careerGoal: 'become a nurse', existingNames: [] });
    expect(names(out)).toContain('Certified Nursing Assistant (CNA)');
  });

  it('falls back to curated when the client throws (timeout/throttle)', async () => {
    const throwing: BedrockInvoker = {
      send: async () => {
        throw new Error('ThrottlingException');
      },
    };
    const suggest = makeBedrockSuggester({ modelId, client: throwing });
    const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
    expect(names(out)).toContain('Advanced Cardiovascular Life Support (ACLS)');
  });

  it('falls back to curated when no model id is configured (env unset, none passed)', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      const suggest = makeBedrockSuggester({ client: stubClient(asJson([{ name: 'X', why: 'y' }])) });
      const out = await suggest({ careerGoal: 'ICU nurse', existingNames: [] });
      expect(names(out)).toContain('BLS/CPR Certification'); // curated, not the stub's "X"
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

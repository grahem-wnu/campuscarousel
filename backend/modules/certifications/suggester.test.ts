import { describe, expect, it } from 'vitest';
import { curatedSuggester } from './suggester.js';

const names = (list: { name: string }[]): string[] => list.map((s) => s.name);

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

  it('filters out certs Keira already holds (case-insensitive, substring-tolerant)', async () => {
    const out = await curatedSuggester({
      careerGoal: 'ICU nurse',
      existingNames: ['bls/cpr certification', 'ACLS'],
    });
    expect(names(out)).not.toContain('BLS/CPR Certification');
    expect(names(out)).not.toContain('Advanced Cardiovascular Life Support (ACLS)');
    expect(names(out)).toContain('Certified Nursing Assistant (CNA)');
  });

  it('every suggestion carries a rationale', async () => {
    const out = await curatedSuggester({ careerGoal: 'ICU nurse', existingNames: [] });
    for (const s of out) expect(s.why.length).toBeGreaterThan(0);
  });
});

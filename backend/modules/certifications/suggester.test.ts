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

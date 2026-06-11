import { describe, expect, it } from 'vitest';
import { packCertifications, packEntranceExam, packFocusBriefs, packsForMajors } from './index.js';
import { focusLine } from '../ai/major.js';

describe('major-pack resolver', () => {
  it('matches nursing by name and common aliases', () => {
    for (const m of ['Nursing', 'nurse', 'BSN', 'Pre-Nursing', 'RN']) {
      expect(packsForMajors([m]).map((p) => p.key)).toEqual(['nursing']);
    }
  });

  it('does NOT false-match an alias as a substring (e.g. "rn" inside "Learning")', () => {
    expect(packsForMajors(['Learning Sciences'])).toEqual([]);
    expect(packsForMajors(['Biology'])).toEqual([]);
  });

  it('returns no pack for an unknown major or empty majors', () => {
    expect(packsForMajors(['Computer Science'])).toEqual([]);
    expect(packsForMajors([])).toEqual([]);
    expect(packsForMajors(undefined)).toEqual([]);
  });

  it('dedupes a pack when multiple of the student major(s) match it', () => {
    expect(packsForMajors(['Nursing', 'BSN']).map((p) => p.key)).toEqual(['nursing']);
  });
});

describe('pack folds', () => {
  it('nursing supplies a focus brief, curated certs (CNA/BLS), and the TEAS exam', () => {
    expect(packFocusBriefs(['Nursing'])[0]).toMatch(/nursing/i);
    const certNames = packCertifications(['Nursing']).map((c) => c.name);
    expect(certNames.some((n) => /BLS/.test(n))).toBe(true);
    expect(certNames.some((n) => /CNA|Certified Nursing Assistant/.test(n))).toBe(true);
    expect(packEntranceExam(['Nursing'])?.examName).toBe('TEAS');
  });

  it('no fold for a non-pack major', () => {
    expect(packFocusBriefs(['History'])).toEqual([]);
    expect(packCertifications(['History'])).toEqual([]);
    expect(packEntranceExam(['History'])).toBeUndefined();
  });
});

describe('focusLine integrates pack guidance', () => {
  it('appends nursing guidance for a nursing student', () => {
    const line = focusLine(['Nursing']);
    expect(line).toContain('pursuing Nursing');
    expect(line).toMatch(/TEAS/); // pack brief folded in
  });

  it('stays generic when no pack matches', () => {
    const line = focusLine(['Anthropology']);
    expect(line).toContain('Anthropology');
    expect(line).not.toMatch(/TEAS/);
  });
});

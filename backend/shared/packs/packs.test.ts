import { describe, expect, it } from 'vitest';
import { benchmarkMetricLabels, packCertifications, packEntranceExam, packExperienceLabel, packFocusBriefs, packInterviewQuestions, packsForMajors } from './index.js';
import { focusLine } from '../ai/major.js';

describe('major-pack resolver', () => {
  it('matches nursing by name and common aliases', () => {
    for (const m of ['Nursing', 'nurse', 'BSN', 'Pre-Nursing', 'RN']) {
      expect(packsForMajors([m]).map((p) => p.key)).toEqual(['nursing']);
    }
  });

  it('does NOT false-match an alias as a substring (e.g. "rn" inside "Learning")', () => {
    expect(packsForMajors(['Learning Sciences'])).toEqual([]); // 'rn' must not match nursing
    expect(packsForMajors(['Astronomy'])).toEqual([]);
  });

  it('returns no pack for an unknown major or empty majors', () => {
    expect(packsForMajors(['Philosophy'])).toEqual([]);
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

  it('nursing supplies seed interview questions (deduped)', () => {
    const qs = packInterviewQuestions(['Nursing']);
    expect(qs.some((q) => /why our nursing program/i.test(q))).toBe(true);
    expect(new Set(qs).size).toBe(qs.length); // no duplicates
  });

  it('no fold for a non-pack major', () => {
    expect(packFocusBriefs(['History'])).toEqual([]);
    expect(packCertifications(['History'])).toEqual([]);
    expect(packEntranceExam(['History'])).toBeUndefined();
    expect(packInterviewQuestions(['History'])).toEqual([]);
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

describe('phase-3 packs resolve by major (and do not cross-match)', () => {
  const cases: [string, string][] = [
    ['Computer Science', 'computer-science'],
    ['CS', 'computer-science'],
    ['Software Development', 'computer-science'],
    ['Pre-med', 'pre-health'],
    ['Biology', 'pre-health'],
    ['Finance', 'business'],
    ['Business Administration', 'business'],
    ['Mechanical Engineering', 'engineering'],
    ['Computer Engineering', 'engineering'], // engineering, NOT computer-science
    ['Elementary Education', 'education'],
    ['Psychology', 'psychology'],
    ['Psychiatry', 'psychology'], // psychiatry routes to the Psychology pack (which covers the pre-med path)
    ['Social Work', 'psychology'],
    ['Neuroscience', 'neuroscience'],
    ['Cognitive Science', 'neuroscience'], // not computer-science
    ['Construction', 'construction-management'],
    ['Building Construction', 'construction-management'],
    ['Architecture', 'architecture'],
  ];
  for (const [major, key] of cases) {
    it(`${major} → ${key}`, () => {
      expect(packsForMajors([major]).map((p) => p.key)).toEqual([key]);
    });
  }

  it('Behavioral Neuroscience resolves to neuroscience, not psychology', () => {
    expect(packsForMajors(['Behavioral Neuroscience']).map((p) => p.key)).toEqual(['neuroscience']);
  });

  it('loose-looking aliases (arch/psych) do not false-match unrelated majors', () => {
    for (const m of ['Marching Band', 'Sociology', 'Astronomy']) {
      expect(packsForMajors([m]).filter((p) => ['architecture', 'psychology', 'neuroscience'].includes(p.key))).toEqual([]);
    }
  });

  it('still resolves nursing, and only nursing carries an entrance exam', () => {
    expect(packsForMajors(['Nursing']).map((p) => p.key)).toEqual(['nursing']);
    expect(packEntranceExam(['Nursing'])?.examName).toBe('TEAS');
    for (const major of ['Computer Science', 'Business', 'Engineering', 'Education', 'Pre-med']) {
      expect(packEntranceExam([major])).toBeUndefined();
    }
  });

  it('an unknown major still matches nothing', () => {
    expect(packsForMajors(['Philosophy'])).toEqual([]);
    expect(packsForMajors(['Physics'])).toEqual([]); // not 'cs'
  });

  it('a multi-major student activates multiple packs', () => {
    expect(packsForMajors(['Nursing', 'Computer Science']).map((p) => p.key).sort()).toEqual(['computer-science', 'nursing']);
  });

  it('a genuinely cross-disciplinary major can match more than one pack (by design)', () => {
    // "Software Engineering" is both CS-ish (software) and engineering — activating both merges guidance.
    expect(packsForMajors(['Software Engineering']).map((p) => p.key).sort()).toEqual(['computer-science', 'engineering']);
  });

  it('benchmark metric labels are major-aware (nursing has TEAS + clinical hours)', () => {
    expect(benchmarkMetricLabels(['Nursing'])).toEqual({ exam: 'TEAS', experience: 'Clinical hours' });
    expect(packExperienceLabel(['Nursing'])).toBe('Clinical hours');
  });

  it('a major with no entrance exam hides it and uses its own experience label', () => {
    const labels = benchmarkMetricLabels(['Construction Management']);
    expect(labels.exam).toBeUndefined(); // no TEAS row for construction
    expect(labels.experience).toBe('Internship / jobsite hours');
  });

  it('an unknown major falls back to generic labels (no exam, generic experience)', () => {
    expect(benchmarkMetricLabels(['Philosophy'])).toEqual({ experience: 'Experience hours' });
  });
});

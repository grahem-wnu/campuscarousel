import { describe, expect, it } from 'vitest';
import { currentGrade, gradeContext } from './grade.js';

const d = (iso: string) => new Date(iso);

describe('currentGrade', () => {
  it('maps grad year + date to the right grade (spring vs fall school year)', () => {
    // Class of 2030: finishing 8th grade in spring 2026, a freshman by fall 2026.
    expect(currentGrade(2030, d('2026-06-15T00:00:00Z'))).toBe(8);
    expect(currentGrade(2030, d('2026-09-15T00:00:00Z'))).toBe(9);
    // A senior is in 12th grade the school year they graduate.
    expect(currentGrade(2026, d('2026-03-01T00:00:00Z'))).toBe(12);
    // Already graduated.
    expect(currentGrade(2024, d('2026-03-01T00:00:00Z'))).toBe(14);
  });
});

describe('gradeContext', () => {
  it('returns undefined without a graduation year', () => {
    expect(gradeContext(undefined, d('2026-06-15T00:00:00Z'))).toBeUndefined();
  });

  it('flags a pre-high-school student and reframes "this year" (the 2030 case)', () => {
    const ctx = gradeContext(2030, d('2026-06-15T00:00:00Z'))!;
    expect(ctx).toMatch(/NOT in high school yet/);
    expect(ctx).toContain('start 9th grade in fall 2026');
    expect(ctx).toMatch(/never current .*junior\/senior tasks/);
  });

  it('names the current high-school grade and warns against senior tasks for an underclassman', () => {
    const ctx = gradeContext(2029, d('2026-09-15T00:00:00Z'))!; // fall 2026 (school year ending 2027) → 10th grade
    expect(ctx).toContain('10th grade (sophomore)');
    expect(ctx).toMatch(/Do NOT hand an underclassman senior-year/);
  });

  it('handles a graduated student', () => {
    expect(gradeContext(2024, d('2026-03-01T00:00:00Z'))).toMatch(/already finished high school/);
  });
});

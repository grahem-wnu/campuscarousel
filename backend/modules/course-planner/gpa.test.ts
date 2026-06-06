import { describe, expect, it } from 'vitest';
import type { Course } from '../../shared/data/index.js';
import { computeGpa, letterToPoints, weightBonus } from './gpa.js';

const course = (over: Partial<Course> = {}): Course => ({
  courseId: Math.random().toString(36).slice(2),
  name: 'Course',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('letterToPoints', () => {
  it('maps standard letters', () => {
    expect(letterToPoints('A')).toBe(4.0);
    expect(letterToPoints('A-')).toBe(3.7);
    expect(letterToPoints('B+')).toBe(3.3);
    expect(letterToPoints('F')).toBe(0.0);
  });
  it('is case/space-insensitive', () => {
    expect(letterToPoints(' a ')).toBe(4.0);
    expect(letterToPoints('b+')).toBe(3.3);
  });
  it('returns null for non-graded values', () => {
    expect(letterToPoints(undefined)).toBeNull();
    expect(letterToPoints('')).toBeNull();
    expect(letterToPoints('P')).toBeNull();
    expect(letterToPoints('IP')).toBeNull();
  });
});

describe('weightBonus', () => {
  it('adds rigor bonuses', () => {
    expect(weightBonus('AP')).toBe(1.0);
    expect(weightBonus('dual-enrollment')).toBe(1.0);
    expect(weightBonus('honors')).toBe(0.5);
    expect(weightBonus('regular')).toBe(0);
    expect(weightBonus(undefined)).toBe(0);
  });
});

describe('computeGpa', () => {
  it('returns zeros for no graded courses', () => {
    expect(computeGpa([])).toEqual({ unweighted: 0, weighted: 0, gradedUnits: 0, gradedCount: 0 });
    expect(computeGpa([course({ grade: undefined }), course({ grade: 'P' })])).toMatchObject({
      gradedCount: 0,
    });
  });

  it('computes a simple unweighted = weighted GPA for regular courses', () => {
    const r = computeGpa([
      course({ grade: 'A', units: 1, type: 'regular' }),
      course({ grade: 'B', units: 1, type: 'regular' }),
    ]);
    expect(r.unweighted).toBe(3.5);
    expect(r.weighted).toBe(3.5);
    expect(r.gradedUnits).toBe(2);
    expect(r.gradedCount).toBe(2);
  });

  it('applies rigor bonus to weighted but not unweighted', () => {
    const r = computeGpa([course({ grade: 'A', units: 1, type: 'AP' })]);
    expect(r.unweighted).toBe(4.0);
    expect(r.weighted).toBe(5.0); // 4.0 + 1.0 AP bonus
  });

  it('honours an explicit gradePoints override for the weighted value', () => {
    const r = computeGpa([course({ grade: 'A', units: 1, type: 'honors', gradePoints: 4.2 })]);
    expect(r.unweighted).toBe(4.0);
    expect(r.weighted).toBe(4.2); // override beats the honors +0.5
  });

  it('weights by units', () => {
    const r = computeGpa([
      course({ grade: 'A', units: 3 }), // 4.0 * 3
      course({ grade: 'C', units: 1 }), // 2.0 * 1
    ]);
    expect(r.unweighted).toBe(3.5); // (12 + 2) / 4
  });

  it('defaults missing/zero units to 1', () => {
    const r = computeGpa([course({ grade: 'A' }), course({ grade: 'B', units: 0 })]);
    expect(r.gradedUnits).toBe(2);
    expect(r.unweighted).toBe(3.5);
  });

  it('ignores ungraded courses in the mix', () => {
    const r = computeGpa([
      course({ grade: 'A', units: 1 }),
      course({ grade: undefined, units: 5 }), // planned — ignored
    ]);
    expect(r.gradedUnits).toBe(1);
    expect(r.unweighted).toBe(4.0);
  });
});

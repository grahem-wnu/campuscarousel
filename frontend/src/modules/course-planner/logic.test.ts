import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  computeGpa,
  courseImportance,
  formatGpa,
  importanceTone,
  letterToPoints,
  unscheduled,
  weightBonus,
} from './logic';
import type { Course } from './types';

const course = (over: Partial<Course> = {}): Course => ({
  courseId: Math.random().toString(36).slice(2),
  name: 'Course',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('GPA logic mirrors the backend', () => {
  it('letterToPoints / weightBonus', () => {
    expect(letterToPoints('A-')).toBe(3.7);
    expect(letterToPoints('P')).toBeNull();
    expect(weightBonus('AP')).toBe(1.0);
    expect(weightBonus('regular')).toBe(0);
  });

  it('computeGpa: rigor bonus applies to weighted only', () => {
    const r = computeGpa([course({ grade: 'A', units: 1, type: 'AP' })]);
    expect(r.unweighted).toBe(4.0);
    expect(r.weighted).toBe(5.0);
  });

  it('computeGpa: explicit gradePoints override', () => {
    const r = computeGpa([course({ grade: 'A', type: 'honors', gradePoints: 4.2 })]);
    expect(r.weighted).toBe(4.2);
  });

  it('computeGpa: ignores ungraded, weights by units', () => {
    const r = computeGpa([
      course({ grade: 'A', units: 3 }),
      course({ grade: 'C', units: 1 }),
      course({ grade: undefined, units: 9 }),
    ]);
    expect(r.unweighted).toBe(3.5);
    expect(r.gradedCount).toBe(2);
  });

  it('formatGpa to 2 decimals', () => {
    expect(formatGpa(3.5)).toBe('3.50');
    expect(formatGpa(4)).toBe('4.00');
  });
});

describe('courseImportance / importanceTone', () => {
  it('classifies subjects', () => {
    expect(courseImportance('science')).toBe('required');
    expect(courseImportance('math')).toBe('required');
    expect(courseImportance('health-sciences')).toBe('required');
    expect(courseImportance('english')).toBe('recommended');
    expect(courseImportance('elective')).toBe('elective');
    expect(courseImportance(undefined)).toBe('elective');
  });
  it('maps importance to a badge tone', () => {
    expect(importanceTone('required')).toBe('error');
    expect(importanceTone('recommended')).toBe('warn');
    expect(importanceTone('elective')).toBe('neutral');
  });
});

describe('buildGrid / unscheduled', () => {
  it('buckets by year and semester, routing full-year/summer/missing to other', () => {
    const grid = buildGrid([
      course({ year: 'freshman', semester: 'fall' }),
      course({ year: 'freshman', semester: 'spring' }),
      course({ year: 'freshman', semester: 'full-year' }),
      course({ year: 'junior', semester: undefined }),
    ]);
    expect(grid.freshman.fall).toHaveLength(1);
    expect(grid.freshman.spring).toHaveLength(1);
    expect(grid.freshman['full-year']).toHaveLength(1);
    expect(grid.junior.other).toHaveLength(1);
    expect(grid.senior.fall).toHaveLength(0);
  });

  it('unscheduled returns courses with no year', () => {
    const items = [course({ year: 'freshman' }), course({ year: undefined })];
    expect(unscheduled(items)).toHaveLength(1);
  });
});

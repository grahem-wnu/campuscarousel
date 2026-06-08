import { describe, expect, it } from 'vitest';
import type { College, Course } from '../../shared/data/index.js';
import { checkPrerequisites } from './prerequisites.js';

const college = (over: Partial<College> = {}): College => ({
  collegeId: 'uci',
  name: 'UC Irvine',
  prerequisites: ['Anatomy', 'Microbiology', 'Statistics'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const course = (over: Partial<Course> = {}): Course => ({
  courseId: Math.random().toString(36).slice(2),
  name: 'Course',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('checkPrerequisites', () => {
  it('reports gaps when no courses satisfy anything', () => {
    const r = checkPrerequisites(college(), []);
    expect(r.totalCount).toBe(3);
    expect(r.satisfiedCount).toBe(0);
    expect(r.gaps).toEqual(['Anatomy', 'Microbiology', 'Statistics']);
  });

  it('marks a prerequisite satisfied (case-insensitive) and lists the course', () => {
    const c = course({ courseId: 'c1', satisfiesPrereq: [{ collegeId: 'uci', prereqName: 'anatomy' }] });
    const r = checkPrerequisites(college(), [c]);
    const anatomy = r.prerequisites.find((p) => p.name === 'Anatomy')!;
    expect(anatomy.satisfied).toBe(true);
    expect(anatomy.satisfiedByCourseIds).toEqual(['c1']);
    expect(r.satisfiedCount).toBe(1);
    expect(r.gaps).toEqual(['Microbiology', 'Statistics']);
  });

  it('only counts satisfiesPrereq entries that target THIS college', () => {
    const c = course({ satisfiesPrereq: [{ collegeId: 'csulb', prereqName: 'Anatomy' }] });
    const r = checkPrerequisites(college(), [c]);
    expect(r.satisfiedCount).toBe(0); // the course satisfies CSULB's anatomy, not UCI's
  });

  it('handles a college with no prerequisites', () => {
    const r = checkPrerequisites(college({ prerequisites: undefined }), []);
    expect(r.totalCount).toBe(0);
    expect(r.satisfiedCount).toBe(0);
    expect(r.gaps).toEqual([]);
  });

  it('can list more than one course satisfying the same prerequisite', () => {
    const a = course({ courseId: 'a', satisfiesPrereq: [{ collegeId: 'uci', prereqName: 'Anatomy' }] });
    const b = course({ courseId: 'b', satisfiesPrereq: [{ collegeId: 'uci', prereqName: 'Anatomy' }] });
    const r = checkPrerequisites(college(), [a, b]);
    expect(r.prerequisites.find((p) => p.name === 'Anatomy')!.satisfiedByCourseIds.sort()).toEqual(['a', 'b']);
  });
});

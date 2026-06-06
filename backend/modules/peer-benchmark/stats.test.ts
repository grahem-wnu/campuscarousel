import { describe, expect, it } from 'vitest';
import type { Activity, Certification, Clinical, Course, Teas } from '../../shared/data/index.js';
import { bestTeasScore, computeGpa, computeKeiraStats, isEarnedCert } from './stats.js';

const course = (over: Partial<Course>): Course =>
  ({ courseId: 'c', name: 'Course', createdAt: '', updatedAt: '', ...over }) as Course;
const teas = (over: Partial<Teas>): Teas =>
  ({ recordId: 'r', type: 'practice-test', date: '2026-01-01', createdAt: '', updatedAt: '', ...over }) as Teas;
const clinical = (over: Partial<Clinical>): Clinical =>
  ({ entryId: 'e', date: '2026-01-01', facility: 'F', hours: 0, visibility: 'family', createdAt: '', updatedAt: '', ...over }) as Clinical;
const activity = (over: Partial<Activity>): Activity =>
  ({ activityId: 'a', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'T', visibility: 'family', createdAt: '', updatedAt: '', ...over }) as Activity;
const cert = (over: Partial<Certification>): Certification =>
  ({ certId: 'k', name: 'Cert', createdAt: '', updatedAt: '', ...over }) as Certification;

describe('computeGpa', () => {
  it('is undefined with no graded courses', () => {
    expect(computeGpa([course({ name: 'Ungraded' })])).toBeUndefined();
  });
  it('weights grade points by units', () => {
    // (4.0*4 + 3.0*1) / (4+1) = 19/5 = 3.8
    const gpa = computeGpa([
      course({ gradePoints: 4.0, units: 4 }),
      course({ gradePoints: 3.0, units: 1 }),
    ]);
    expect(gpa).toBe(3.8);
  });
  it('treats a missing/zero unit count as 1', () => {
    expect(computeGpa([course({ gradePoints: 4.0 }), course({ gradePoints: 3.0 })])).toBe(3.5);
  });
});

describe('bestTeasScore', () => {
  it('returns the highest overall score', () => {
    expect(bestTeasScore([teas({ overallScore: 78 }), teas({ overallScore: 85 }), teas({})])).toBe(85);
  });
  it('is undefined when no record has a score', () => {
    expect(bestTeasScore([teas({}), teas({})])).toBeUndefined();
  });
});

describe('isEarnedCert', () => {
  it('counts active/renewed or a recorded dateEarned', () => {
    expect(isEarnedCert(cert({ status: 'active' }))).toBe(true);
    expect(isEarnedCert(cert({ status: 'renewed' }))).toBe(true);
    expect(isEarnedCert(cert({ dateEarned: '2026-01-01' }))).toBe(true);
  });
  it('counts expiring-soon (still valid) but not expired', () => {
    expect(isEarnedCert(cert({ status: 'expiring-soon' }))).toBe(true);
    expect(isEarnedCert(cert({ status: 'expired', dateEarned: '2020-01-01' }))).toBe(false);
  });

  it('does not count planned/in-progress (even with a dateEarned) or bare certs', () => {
    expect(isEarnedCert(cert({ status: 'planned', dateEarned: '2026-01-01' }))).toBe(false);
    expect(isEarnedCert(cert({ status: 'in-progress' }))).toBe(false);
    expect(isEarnedCert(cert({}))).toBe(false);
  });
});

describe('computeKeiraStats', () => {
  it('aggregates GPA, best TEAS, hours, and earned cert names', () => {
    const stats = computeKeiraStats({
      courses: [course({ gradePoints: 4.0, units: 1 })],
      teas: [teas({ overallScore: 80 }), teas({ overallScore: 88 })],
      clinical: [clinical({ hours: 10 }), clinical({ hours: 5.5 })],
      activities: [
        activity({ category: 'volunteer', hours: 12 }),
        activity({ category: 'academic', hours: 99 }), // not volunteer → excluded
        activity({ category: 'volunteer', hours: 3 }),
      ],
      certifications: [cert({ name: 'CNA', status: 'active' }), cert({ name: 'BLS', status: 'planned' })],
    });
    expect(stats).toEqual({
      gpa: 4.0,
      teasScore: 88,
      clinicalHours: 15.5,
      volunteerHours: 15,
      certifications: ['CNA'],
    });
  });

  it('leaves GPA/TEAS undefined and hours at 0 with no data', () => {
    expect(computeKeiraStats({ courses: [], teas: [], clinical: [], activities: [], certifications: [] })).toEqual({
      gpa: undefined,
      teasScore: undefined,
      clinicalHours: 0,
      volunteerHours: 0,
      certifications: [],
    });
  });
});

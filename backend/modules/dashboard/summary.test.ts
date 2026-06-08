import { describe, expect, it } from 'vitest';
import type { Activity, Certification, College, Course, Goal, Interview, Scholarship, Teas } from '../../shared/data/index.js';
import {
  activitySummary,
  budgetSummary,
  certSummary,
  clinicalTotalHours,
  collegeCounts,
  computeGpa,
  goalSummary,
  interviewReadiness,
  latestTeas,
  recentFeed,
  upcomingDeadlines,
} from './summary.js';

const TODAY = '2026-06-06';
const act = (o: Partial<Activity>): Activity => ({ activityId: 'a', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'X', visibility: 'family', ...o } as Activity);

describe('computeGpa', () => {
  it('weights by units and estimates unweighted by capping at 4', () => {
    const courses: Course[] = [
      { courseId: '1', name: 'AP Bio', gradePoints: 4.5, units: 1, type: 'AP', createdAt: 'x', updatedAt: 'x' },
      { courseId: '2', name: 'Algebra', gradePoints: 3.0, units: 1, createdAt: 'x', updatedAt: 'x' },
    ];
    expect(computeGpa(courses)).toEqual({ weighted: 3.75, unweighted: 3.5, courses: 2 });
  });
  it('returns null with no graded courses', () => {
    expect(computeGpa([])).toEqual({ weighted: null, unweighted: null, courses: 0 });
  });
});

describe('activitySummary + streak', () => {
  it('sums hours by category and counts consecutive recent weeks', () => {
    const s = activitySummary(
      [
        act({ date: '2026-06-03', category: 'volunteer', hours: 2 }), // this week
        act({ date: '2026-05-28', category: 'clinical', hours: 3 }), // last week
        act({ date: '2026-05-20', category: 'volunteer', hours: 1 }), // 2 weeks ago
        act({ date: '2026-04-01', category: 'volunteer', hours: 5 }), // gap → not in streak
      ],
      TODAY,
    );
    expect(s.totalHours).toBe(11);
    expect(s.hoursByCategory).toEqual({ volunteer: 8, clinical: 3 });
    expect(s.weeklyStreak).toBe(3);
  });
  it('streak is 0 when nothing this week', () => {
    expect(activitySummary([act({ date: '2026-01-01', hours: 1 })], TODAY).weeklyStreak).toBe(0);
  });
});

describe('clinicalTotalHours / latestTeas', () => {
  it('sums clinical hours', () => {
    expect(clinicalTotalHours([{ entryId: '1', date: '2026-01-01', facility: 'A', hours: 4, visibility: 'family', createdAt: 'x', updatedAt: 'x' }])).toBe(4);
  });
  it('finds the latest scored TEAS', () => {
    const teas: Teas[] = [
      { recordId: '1', type: 'practice-test', date: '2026-01-01', overallScore: 60, createdAt: 'x', updatedAt: 'x' },
      { recordId: '2', type: 'practice-test', date: '2026-03-01', overallScore: 75, createdAt: 'x', updatedAt: 'x' },
    ];
    expect(latestTeas(teas)).toEqual({ date: '2026-03-01', overallScore: 75 });
    expect(latestTeas([])).toBeNull();
  });
});

describe('certSummary', () => {
  it('buckets active / expiring-soon / expired / planned', () => {
    const certs: Certification[] = [
      { certId: '1', name: 'BLS', status: 'active', expirationDate: '2027-01-01', createdAt: 'x', updatedAt: 'x' },
      { certId: '2', name: 'CPR', status: 'active', expirationDate: '2026-07-01', createdAt: 'x', updatedAt: 'x' }, // 25 days
      { certId: '3', name: 'Old', status: 'active', expirationDate: '2026-01-01', createdAt: 'x', updatedAt: 'x' }, // expired
      { certId: '4', name: 'CNA', status: 'planned', createdAt: 'x', updatedAt: 'x' },
    ];
    expect(certSummary(certs, TODAY)).toEqual({ active: 1, expiringSoon: 1, expired: 1, planned: 1 });
  });
});

describe('upcomingDeadlines', () => {
  it('merges sources, drops past, sorts soonest-first, caps', () => {
    const colleges: College[] = [{ collegeId: 'c', name: 'OSU', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01', earlyAction: '2025-01-01' }, createdAt: 'x', updatedAt: 'x' }];
    const goals: Goal[] = [{ goalId: 'g', title: 'TEAS by', targetDate: '2026-07-01', status: 'in-progress', createdAt: 'x', updatedAt: 'x' }];
    const scholarships: Scholarship[] = [{ scholarshipId: 's', name: 'Merit', applicationDeadline: '2026-06-20', status: 'researching', createdAt: 'x', updatedAt: 'x' }];
    const certifications: Certification[] = [{ certId: 'r', name: 'BLS', renewalRequired: true, expirationDate: '2026-08-01', createdAt: 'x', updatedAt: 'x' }];
    const out = upcomingDeadlines({ colleges, goals, scholarships, certifications }, TODAY);
    expect(out.map((d) => d.source)).toEqual(['scholarship', 'goal', 'certification', 'college']); // by daysUntil
    expect(out.every((d) => d.daysUntil >= 0)).toBe(true);
  });
});

describe('collegeCounts / goalSummary / budgetSummary / interviewReadiness / recentFeed', () => {
  it('counts colleges by status (removed excluded)', () => {
    const colleges: College[] = [
      { collegeId: '1', name: 'A', status: 'target', createdAt: 'x', updatedAt: 'x' },
      { collegeId: '2', name: 'B', status: 'target', createdAt: 'x', updatedAt: 'x' },
      { collegeId: '3', name: 'C', status: 'removed', createdAt: 'x', updatedAt: 'x' },
    ];
    expect(collegeCounts(colleges)).toEqual({ target: 2 });
  });
  it('summarizes goals', () => {
    const goals: Goal[] = [
      { goalId: '1', title: 'a', status: 'completed', progress: 100, createdAt: 'x', updatedAt: 'x' },
      { goalId: '2', title: 'b', status: 'in-progress', progress: 40, createdAt: 'x', updatedAt: 'x' },
    ];
    expect(goalSummary(goals)).toEqual({ total: 2, completed: 1, inProgress: 1, avgProgress: 70 });
  });
  it('summarizes budget + scholarships', () => {
    const scholarships: Scholarship[] = [
      { scholarshipId: '1', name: 'A', status: 'awarded', awardedAmount: 5000, createdAt: 'x', updatedAt: 'x' },
      { scholarshipId: '2', name: 'B', status: 'applied', createdAt: 'x', updatedAt: 'x' },
    ];
    const colleges: College[] = [{ collegeId: 'c', name: 'OSU', isTopPick: true, estimatedCostAfterAid: 22000, createdAt: 'x', updatedAt: 'x' }];
    expect(budgetSummary({ totalBudget: 80000 }, scholarships, colleges)).toEqual({ totalBudget: 80000, awarded: 5000, scholarshipsApplied: 2, scholarshipsAwarded: 1, topPickNetCost: 22000 });
  });
  it('averages mock interview ratings', () => {
    const interviews: Interview[] = [{ sessionId: '1', createdBy: 'keira', type: 'mock-practice', date: '2026-01-01', questions: [{ question: 'q', rating: 4 }, { question: 'q2', rating: 2 }], createdAt: 'x', updatedAt: 'x' }];
    expect(interviewReadiness(interviews)).toEqual({ avgRating: 3, answered: 2 });
  });
  it('builds a recent feed newest-first', () => {
    const feed = recentFeed([act({ date: '2026-01-01', title: 'Old' }), act({ date: '2026-05-01', title: 'New' })]);
    expect(feed.map((f) => f.title)).toEqual(['New', 'Old']);
  });
});

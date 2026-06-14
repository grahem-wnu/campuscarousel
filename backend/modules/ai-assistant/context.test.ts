import { describe, expect, it } from 'vitest';
import type { Activity, College, Course, Goal, Scholarship, ExamScore, Motivation } from '../../shared/data/index.js';
import { buildSummary, selectRecords } from './context.js';

const course = (o: Partial<Course>): Course => ({ courseId: 'c', name: 'C', createdAt: '', updatedAt: '', ...o }) as Course;
const exam = (o: Partial<ExamScore>): ExamScore => ({ recordId: 'r', type: 'practice-test', date: '2026-01-01', createdAt: '', updatedAt: '', ...o }) as ExamScore;
const activity = (o: Partial<Activity>): Activity =>
  ({ activityId: 'a', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'T', visibility: 'family', createdAt: '', updatedAt: '', ...o }) as Activity;
const why = (o: Partial<Motivation>): Motivation =>
  ({ entryId: 'w', date: '2026-01-01', title: 'T', content: 'C', visibility: 'family', createdAt: '', updatedAt: '', ...o }) as Motivation;

describe('buildSummary', () => {
  it('computes GPA, best TEAS, hours, and counts', () => {
    const s = buildSummary({
      courses: [course({ gradePoints: 4.0, units: 2 }), course({ gradePoints: 3.0, units: 2 })],
      exams: [exam({ overallScore: 80 }), exam({ overallScore: 88 })],
      experiences: [{ entryId: 'e', date: '2026-01-01', facility: 'F', hours: 12, visibility: 'family', createdAt: '', updatedAt: '' }],
      activities: [activity({ category: 'volunteer', hours: 10 }), activity({ category: 'academic', hours: 99 })],
      colleges: [{ collegeId: 'c1', name: 'UCLA', createdAt: '', updatedAt: '' } as College],
      goals: [{ goalId: 'g1', title: 'G', createdAt: '', updatedAt: '' } as Goal],
    });
    expect(s.gpa).toBe(3.5);
    expect(s.bestTeas).toBe(88);
    expect(s.clinicalHours).toBe(12);
    expect(s.volunteerHours).toBe(10);
    expect(s.collegeCount).toBe(1);
    expect(s.goalCount).toBe(1);
  });
});

describe('selectRecords', () => {
  const sources = {
    motivations: [why({ entryId: 'w1', title: 'Why', content: 'A long meaningful story.' })],
    activities: [activity({ activityId: 'a1', title: 'CHOC', description: 'helped kids' })],
    experiences: [],
    colleges: [{ collegeId: 'c1', name: 'UCLA', createdAt: '', updatedAt: '' } as College],
    scholarships: [{ scholarshipId: 's1', name: 'Nightingale', createdAt: '', updatedAt: '' } as Scholarship],
  };

  it('essay-partner pulls motivation + activities', () => {
    const recs = selectRecords('essay-partner', sources);
    expect(recs.some((r) => r.kind === 'motivation' && r.text.includes('Why'))).toBe(true);
    expect(recs.some((r) => r.kind === 'activity')).toBe(true);
  });
  it('college-discovery pulls colleges (bare name when not yet hydrated)', () => {
    const recs = selectRecords('college-discovery', sources);
    expect(recs).toEqual([{ kind: 'college', text: 'UCLA' }]);
  });
  it('grounds tracked colleges with hydrated cost + deadline facts', () => {
    const duke = {
      collegeId: 'd', name: 'Duke University', location: 'Durham, NC',
      estimatedNetPriceAfterAid: 22000, costOfAttendanceOutOfState: 86000,
      applicationDeadlines: { earlyAction: 'Nov 1', regularDecision: 'Jan 2' },
      createdAt: '2026-06-01', updatedAt: '',
    } as College;
    const recs = selectRecords('college-discovery', { ...sources, colleges: [duke] });
    expect(recs[0]?.text).toContain('Duke University');
    expect(recs[0]?.text).toContain('net price after aid ~$22,000/yr');
    expect(recs[0]?.text).toContain('cost of attendance ~$86,000/yr');
    expect(recs[0]?.text).toContain('regular decision Jan 2');
  });
  it('ask mode includes the tracked colleges (so cost questions are grounded)', () => {
    const recs = selectRecords('ask', sources);
    expect(recs.some((r) => r.kind === 'college' && r.text.includes('UCLA'))).toBe(true);
  });
  it('scholarship-discovery pulls scholarships', () => {
    const recs = selectRecords('scholarship-discovery', sources);
    expect(recs).toEqual([{ kind: 'scholarship', text: 'Nightingale' }]);
  });
});

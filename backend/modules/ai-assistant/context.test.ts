import { describe, expect, it } from 'vitest';
import type { Activity, College, Course, Goal, Scholarship, Teas, WhyNursing } from '../../shared/data/index.js';
import { buildSummary, selectRecords } from './context.js';

const course = (o: Partial<Course>): Course => ({ courseId: 'c', name: 'C', createdAt: '', updatedAt: '', ...o }) as Course;
const teas = (o: Partial<Teas>): Teas => ({ recordId: 'r', type: 'practice-test', date: '2026-01-01', createdAt: '', updatedAt: '', ...o }) as Teas;
const activity = (o: Partial<Activity>): Activity =>
  ({ activityId: 'a', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'T', visibility: 'family', createdAt: '', updatedAt: '', ...o }) as Activity;
const why = (o: Partial<WhyNursing>): WhyNursing =>
  ({ entryId: 'w', date: '2026-01-01', title: 'T', content: 'C', visibility: 'family', createdAt: '', updatedAt: '', ...o }) as WhyNursing;

describe('buildSummary', () => {
  it('computes GPA, best TEAS, hours, and counts', () => {
    const s = buildSummary({
      courses: [course({ gradePoints: 4.0, units: 2 }), course({ gradePoints: 3.0, units: 2 })],
      teas: [teas({ overallScore: 80 }), teas({ overallScore: 88 })],
      clinical: [{ entryId: 'e', date: '2026-01-01', facility: 'F', hours: 12, visibility: 'family', createdAt: '', updatedAt: '' }],
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
    whyNursing: [why({ entryId: 'w1', title: 'Why', content: 'A long meaningful story.' })],
    activities: [activity({ activityId: 'a1', title: 'CHOC', description: 'helped kids' })],
    clinical: [],
    colleges: [{ collegeId: 'c1', name: 'UCLA', createdAt: '', updatedAt: '' } as College],
    scholarships: [{ scholarshipId: 's1', name: 'Nightingale', createdAt: '', updatedAt: '' } as Scholarship],
  };

  it('essay-partner pulls why-nursing + activities', () => {
    const recs = selectRecords('essay-partner', sources);
    expect(recs.some((r) => r.kind === 'why-nursing' && r.text.includes('Why'))).toBe(true);
    expect(recs.some((r) => r.kind === 'activity')).toBe(true);
  });
  it('college-discovery pulls colleges', () => {
    const recs = selectRecords('college-discovery', sources);
    expect(recs).toEqual([{ kind: 'college', text: 'UCLA' }]);
  });
  it('scholarship-discovery pulls scholarships', () => {
    const recs = selectRecords('scholarship-discovery', sources);
    expect(recs).toEqual([{ kind: 'scholarship', text: 'Nightingale' }]);
  });
});

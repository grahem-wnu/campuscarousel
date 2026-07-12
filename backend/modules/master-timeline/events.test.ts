import { describe, expect, it } from 'vitest';
import type { Activity, Certification, College, Goal, Scholarship, ExamScore, Visit } from '../../shared/data/index.js';
import { buildEvents, filterEvents, upcoming, type EventSources } from './events.js';

describe('buildEvents — college deadlines projected onto the student cycle', () => {
  const college = {
    collegeId: 'c1',
    name: 'USC',
    status: 'researching',
    branding: { logoUrl: 'https://logo' },
    applicationDeadlines: {
      earlyAction: '2026-11-01 — Early Action', // Nov → senior fall
      regularDecision: 'November 30 (no year given)', // year supplied from the cycle
    },
  } as unknown as College;

  it('dates deadlines to the senior-year cycle (grad year) and carries the logo', () => {
    const events = buildEvents({
      activities: [], goals: [], colleges: [college], exams: [], visits: [], scholarships: [], certifications: [],
      graduationYear: 2029, // applies fall 2028
    });
    const collegeEvents = events.filter((e) => e.source === 'college');
    expect(collegeEvents.map((e) => e.date).sort()).toEqual(['2028-11-01', '2028-11-30']);
    expect(collegeEvents.every((e) => e.logoUrl === 'https://logo')).toBe(true);
  });

  it('without a grad year, keeps an explicit year and skips year-less deadlines', () => {
    const events = buildEvents({ activities: [], goals: [], colleges: [college], exams: [], visits: [], scholarships: [], certifications: [] });
    const collegeEvents = events.filter((e) => e.source === 'college');
    expect(collegeEvents.map((e) => e.date)).toEqual(['2026-11-01']); // EA has a year; the year-less RD is skipped
  });
});

const TODAY = '2026-06-06';

const sources = (over: Partial<EventSources> = {}): EventSources => ({
  activities: [],
  goals: [],
  colleges: [],
  exams: [],
  visits: [],
  scholarships: [],
  certifications: [],
  ...over,
});

const activity = (o: Partial<Activity>): Activity => ({ activityId: 'a1', userId: 'keira', date: '2026-06-01', category: 'volunteer', title: 'Soup kitchen', visibility: 'family', ...o }) as Activity;

describe('buildEvents', () => {
  it('aggregates every source into one date-sorted stream', () => {
    const s = sources({
      activities: [activity({ date: '2026-06-10', title: 'Volunteering' })],
      goals: [{ goalId: 'g', title: 'Finish app', status: 'in-progress', targetDate: '2026-07-01', createdAt: 'x', updatedAt: 'x' } as Goal],
      colleges: [{ collegeId: 'c', name: 'OSU', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01', earlyAction: '2026-11-01' }, createdAt: 'x', updatedAt: 'x' } as College],
      exams: [{ recordId: 't', type: 'official-exam', date: '2026-08-15', createdAt: 'x', updatedAt: 'x' } as ExamScore, { recordId: 't2', type: 'practice-test', date: '2026-07-01', createdAt: 'x', updatedAt: 'x' } as ExamScore],
      visits: [{ visitId: 'v', collegeId: 'c', date: '2026-09-01', visitType: 'campus-tour', createdAt: 'x', updatedAt: 'x' } as Visit],
      scholarships: [{ scholarshipId: 's', name: 'Merit', applicationDeadline: '2026-06-20', status: 'researching', createdAt: 'x', updatedAt: 'x' } as Scholarship],
      certifications: [{ certId: 'r', name: 'BLS', renewalRequired: true, expirationDate: '2026-10-01', createdAt: 'x', updatedAt: 'x' } as Certification],
    });
    const events = buildEvents(s);
    // date-sorted: activity 06-10, scholarship 06-20, goal 07-01, teas 08-15, visit 09-01, cert 10-01, college 11-01, college 12-01
    expect(events.map((e) => e.source)).toEqual(['activity', 'scholarship', 'goal', 'exam', 'visit', 'certification', 'college', 'college']);
    // practice tests are excluded; only official-exam becomes an exam event
    expect(events.filter((e) => e.source === 'exam')).toHaveLength(1);
    expect(events.filter((e) => e.source === 'college').map((e) => e.type)).toEqual(['early-action', 'regular-decision']);
  });

  it('excludes removed colleges, completed goals, and awarded scholarships', () => {
    const s = sources({
      colleges: [{ collegeId: 'c', name: 'Gone', status: 'removed', applicationDeadlines: { regularDecision: '2026-12-01' }, createdAt: 'x', updatedAt: 'x' } as College],
      goals: [{ goalId: 'g', title: 'done', status: 'completed', targetDate: '2026-07-01', createdAt: 'x', updatedAt: 'x' } as Goal],
      scholarships: [{ scholarshipId: 's', name: 'Won', applicationDeadline: '2026-06-20', status: 'awarded', createdAt: 'x', updatedAt: 'x' } as Scholarship],
    });
    expect(buildEvents(s)).toHaveLength(0);
  });
});

describe('filterEvents', () => {
  const s = sources({
    activities: [activity({ date: '2026-06-10', title: 'V' })],
    scholarships: [{ scholarshipId: 's', name: 'Merit', applicationDeadline: '2026-12-20', status: 'researching', createdAt: 'x', updatedAt: 'x' } as Scholarship],
  });
  const events = buildEvents(s);
  it('filters by source and date range', () => {
    expect(filterEvents(events, { source: 'activity' }).every((e) => e.source === 'activity')).toBe(true);
    expect(filterEvents(events, { from: '2026-12-01' }).map((e) => e.source)).toEqual(['scholarship']);
    expect(filterEvents(events, { to: '2026-06-30' }).map((e) => e.source)).toEqual(['activity']);
  });
});

describe('upcoming', () => {
  it('keeps overdue + within-horizon, sorts overdue-first, and buckets', () => {
    const s = sources({
      goals: [
        { goalId: 'overdue', title: 'Past', status: 'in-progress', targetDate: '2026-05-01', createdAt: 'x', updatedAt: 'x' } as Goal, // overdue
        { goalId: 'soon', title: 'Soon', status: 'in-progress', targetDate: '2026-06-10', createdAt: 'x', updatedAt: 'x' } as Goal, // this-week
        { goalId: 'far', title: 'Far', status: 'in-progress', targetDate: '2027-06-01', createdAt: 'x', updatedAt: 'x' } as Goal, // beyond horizon
      ],
    });
    const up = upcoming(buildEvents(s), TODAY, 90);
    expect(up.map((e) => e.title)).toEqual(['Past', 'Soon']); // far excluded; overdue first
    expect(up[0]).toMatchObject({ group: 'overdue' });
    expect(up[1]).toMatchObject({ group: 'this-week' });
  });
});

import { describe, expect, it } from 'vitest';
import type { Activity, Certification, College, Goal, Scholarship, ExamScore, Visit } from '../../shared/data/index.js';
import { buildEvents, filterEvents, parseDeadlineDate, upcoming, type EventSources } from './events.js';

describe('parseDeadlineDate', () => {
  it('extracts an ISO date (the new hydration format)', () => {
    expect(parseDeadlineDate('2026-11-01 — Early Action, non-binding')).toBe('2026-11-01');
  });
  it('extracts a "Month D, YYYY" date (older prose)', () => {
    expect(parseDeadlineDate('November 1, 2026 (non-binding; decisions mid-January)')).toBe('2026-11-01');
    expect(parseDeadlineDate('December 15th, 2026')).toBe('2026-12-15');
  });
  it('returns "" when there is no resolvable full date', () => {
    expect(parseDeadlineDate('Not offered — no Early Action')).toBe('');
    expect(parseDeadlineDate('November 30 (no year given)')).toBe('');
    expect(parseDeadlineDate(undefined)).toBe('');
  });
});

describe('buildEvents — college deadlines parse to real dates', () => {
  it('only emits college deadline events with a parseable date', () => {
    const college = {
      collegeId: 'c1',
      name: 'USC',
      status: 'researching',
      applicationDeadlines: {
        earlyAction: '2026-11-01 — Early Action',
        regularDecision: 'November 30 (no year)', // unparseable → skipped
      },
    } as unknown as College;
    const events = buildEvents({ activities: [], goals: [], colleges: [college], exams: [], visits: [], scholarships: [], certifications: [] });
    const collegeEvents = events.filter((e) => e.source === 'college');
    expect(collegeEvents).toHaveLength(1);
    expect(collegeEvents[0]).toMatchObject({ type: 'early-action', date: '2026-11-01' });
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

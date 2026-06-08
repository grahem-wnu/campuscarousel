import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type DashboardHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: DashboardHandlers;

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data, now });
  // family + private activities (private only countable by keira)
  await data.activities.create({ userId: 'keira', date: '2026-06-03', category: 'volunteer', title: 'Soup kitchen', hours: 4, visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-06-04', category: 'personal', title: 'Private reflection', hours: 2, visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  await data.clinical.create({ date: '2026-05-01', facility: 'County', hours: 6, visibility: 'family' } as Parameters<Data['clinical']['create']>[0]);
  await data.clinical.create({ date: '2026-05-02', facility: 'Private clinic', hours: 3, visibility: 'private' } as Parameters<Data['clinical']['create']>[0]);
  await data.courses.create({ name: 'AP Bio', gradePoints: 4.5, units: 1, type: 'AP' } as Parameters<Data['courses']['create']>[0]);
  await data.teas.create({ type: 'practice-test', date: '2026-05-01', overallScore: 80 } as Parameters<Data['teas']['create']>[0]);
  await data.colleges.create({ name: 'OSU', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01' } } as Parameters<Data['colleges']['create']>[0]);
  await data.goals.create({ title: 'Hit TEAS 80', status: 'in-progress', progress: 60, targetDate: '2026-08-01' } as Parameters<Data['goals']['create']>[0]);
  await data.budget.put({ totalBudget: 80000 } as Parameters<Data['budget']['put']>[0]);
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: keira, params: {}, query: {}, body: undefined, ...over });

describe('GET /dashboard', () => {
  it('student view includes private-derived stats + a student section', async () => {
    const res = await h.get(ctx());
    expect(res.status).toBe(200);
    const b = res.body as { role: string; activity: { totalHours: number }; clinicalHours: number; student: { weeklyStreak: number; interviewReadiness: unknown }; recentFeed: { title: string }[]; gpa: { weighted: number } };
    expect(b.role).toBe('student');
    expect(b.activity.totalHours).toBe(6); // 4 family + 2 private (keira sees both)
    expect(b.clinicalHours).toBe(9); // 6 + 3 private
    expect(b.gpa.weighted).toBe(4.5);
    expect(b.student.weeklyStreak).toBeGreaterThanOrEqual(1);
    expect(b.recentFeed.some((f) => f.title === 'Private reflection')).toBe(true);
    expect(b).not.toHaveProperty('family');
  });

  it('PRIVACY: a parent view EXCLUDES keira’s private activities/clinical and has a family section', async () => {
    const res = await h.get(ctx({ requester: kate }));
    const b = res.body as { role: string; activity: { totalHours: number }; clinicalHours: number; recentFeed: { title: string }[]; family: { budget: { totalBudget: number }; goals: { total: number } } };
    expect(b.role).toBe('parent');
    expect(b.activity.totalHours).toBe(4); // private 2h excluded
    expect(b.clinicalHours).toBe(6); // private 3h excluded
    expect(b.recentFeed.some((f) => f.title === 'Private reflection')).toBe(false);
    expect(b.family.budget.totalBudget).toBe(80000);
    expect(b.family.goals.total).toBe(1);
  });

  it('includes upcoming deadlines and college counts for everyone', async () => {
    const b = (await h.get(ctx())).body as { upcomingDeadlines: { source: string }[]; collegeCounts: Record<string, number> };
    expect(b.upcomingDeadlines.length).toBeGreaterThan(0);
    expect(b.collegeCounts).toEqual({ applying: 1 });
  });
});

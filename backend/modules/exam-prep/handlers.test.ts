import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type ExamHandlers } from './handlers.js';
import type { Analyzer, AnalyzeContext, PlanInput, Planner } from './ai.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: ExamHandlers;
let planCalls: PlanInput[];
let analyzeCalls: AnalyzeContext[];

const stubPlanner: Planner = async (input) => {
  planCalls.push(input);
  return { summary: 'P', focusAreas: input.weakSections, weeks: [{ week: 1, focus: input.weakSections, hours: input.hoursPerWeek, practice: 'x' }], source: 'curated' };
};
const stubAnalyzer: Analyzer = async (ctxIn) => {
  analyzeCalls.push(ctxIn);
  return { summary: 'A', recommendations: ['r'], readiness: 'ok', source: 'curated' };
};

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  planCalls = [];
  analyzeCalls = [];
  h = makeHandlers({ getData: () => data, now, planner: stubPlanner, analyzer: stubAnalyzer });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});
const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seed(over: Record<string, unknown>): Promise<string> {
  const r = await data.exams.create({ type: 'practice-test', date: '2026-01-01', ...over } as Parameters<Data['exams']['create']>[0]);
  return r.recordId;
}

describe('create / list / detail / update / remove', () => {
  it('creates a record (201) and a parent may too (family-visible)', async () => {
    const res = await h.create(ctx({ requester: kate, body: { type: 'practice-test', date: '2026-02-01', overallScore: 72 } }));
    expect(res.status).toBe(201);
    expect((res.body as { overallScore: number }).overallScore).toBe(72);
  });

  it('422s on invalid input (bad type, out-of-range score, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { type: 'nope', date: '2026-02-01' } })), 422);
    await expectStatus(h.create(ctx({ body: { type: 'practice-test', date: '2026-02-01', overallScore: 120 } })), 422);
    await expectStatus(h.create(ctx({ body: { type: 'practice-test', date: '2026-02-01', bogus: 1 } })), 422);
  });

  it('lists all and filters by type', async () => {
    await seed({ type: 'practice-test', date: '2026-01-01', overallScore: 60 });
    await seed({ type: 'study-session', date: '2026-01-05', studyDuration: 2 });
    const all = await h.list(ctx());
    expect((all.body as { records: unknown[] }).records).toHaveLength(2);
    const sessions = await h.list(ctx({ query: { type: 'study-session' } }));
    expect((sessions.body as { records: unknown[] }).records).toHaveLength(1);
  });

  it('detail/update/remove with 404s', async () => {
    const id = await seed({ overallScore: 60 });
    expect((await h.detail(ctx({ params: { id } }))).status).toBe(200);
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);

    const upd = await h.update(ctx({ params: { id }, body: { overallScore: 80 } }));
    expect((upd.body as { overallScore: number }).overallScore).toBe(80);
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { overallScore: 80 } })), 404);

    expect((await h.remove(ctx({ params: { id } }))).status).toBe(204);
    expect(await data.exams.get(id)).toBeNull();
    await expectStatus(h.remove(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('progress', () => {
  it('returns progression, summary, and readiness', async () => {
    await seed({ date: '2026-01-01', overallScore: 60, sectionScores: { math: 50, reading: 80, science: 70, englishLanguageUsage: 82 } });
    await seed({ date: '2026-02-01', overallScore: 75 });
    const res = await h.progress(ctx());
    const body = res.body as { progression: unknown[]; summary: { attempts: number; trend: number }; readiness: { ready: boolean } };
    expect(body.progression).toHaveLength(2);
    expect(body.summary.attempts).toBe(2);
    expect(body.summary.trend).toBe(15);
    expect(body.readiness.ready).toBe(false);
  });
});

describe('study-plan', () => {
  it('derives weeks-until-exam (pinned clock), weak sections, and latest overall', async () => {
    await seed({ date: '2026-05-01', overallScore: 70, sectionScores: { math: 55, reading: 85, science: 60, englishLanguageUsage: 90 } });
    const res = await h.studyPlan(ctx({ body: { examDate: '2026-07-04', targetScore: 80, hoursPerWeek: 10 } }));
    expect(res.status).toBe(200);
    expect(planCalls).toHaveLength(1);
    const input = planCalls[0]!;
    expect(input.weeksUntilExam).toBe(4); // Jun 6 → Jul 4
    expect(input.targetScore).toBe(80);
    expect(input.hoursPerWeek).toBe(10);
    expect(input.latestOverall).toBe(70);
    expect(input.weakSections).toEqual(['Math', 'Science']); // labels, weakest first
  });

  it('honors an explicit focusAreas override and 422s on unknown fields', async () => {
    const res = await h.studyPlan(ctx({ body: { focusAreas: ['Test-taking strategy'] } }));
    expect(planCalls[0]?.weakSections).toEqual(['Test-taking strategy']);
    expect((res.body as { plan: { weeks: unknown[] } }).plan.weeks).toHaveLength(1);
    await expectStatus(h.studyPlan(ctx({ body: { bogus: 1 } })), 422);
  });
});

describe('analyze', () => {
  it('passes a progress summary + target to the analyzer', async () => {
    await seed({ date: '2026-01-01', overallScore: 60 });
    await seed({ date: '2026-02-01', overallScore: 72 });
    const res = await h.analyze(ctx({ body: { targetScore: 80 } }));
    expect((res.body as { analysis: { summary: string } }).analysis.summary).toBe('A');
    expect(analyzeCalls[0]?.targetScore).toBe(80);
    expect(analyzeCalls[0]?.summary.attempts).toBe(2);
  });
});

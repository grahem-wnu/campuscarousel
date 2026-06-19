import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data, type Goal } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type GoalHandlers } from './handlers.js';
import type { GoalSuggester, SuggestedGoal } from './suggester.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: GoalHandlers;
let suggestArg: unknown;
let suggestResult: SuggestedGoal[];

const fakeSuggester: GoalSuggester = {
  suggest: (input) => {
    suggestArg = input;
    return Promise.resolve(suggestResult);
  },
};

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => fakeSuggester);
  suggestArg = undefined;
  suggestResult = [];
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

async function seedGoal(over: Partial<Goal> = {}): Promise<string> {
  const g = await data.goals.create({
    title: 'Seed goal',
    status: 'not-started',
    createdBy: 'keira',
    ...over,
  } as Parameters<Data['goals']['create']>[0]);
  return g.goalId;
}

describe('create (POST /goals)', () => {
  it('records the creator from the JWT and defaults status to not-started', async () => {
    const res = await h.create(ctx({ requester: kate, body: { title: 'Take the TEAS' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Take the TEAS', status: 'not-started', createdBy: 'kate' });
  });

  it('ignores a client-supplied creator (createdBy comes from the JWT, body field is unknown → 422)', async () => {
    await expectStatus(h.create(ctx({ body: { title: 'x', createdBy: 'someone-else' } })), 422);
  });

  it('persists a manual progress value when there are no milestones', async () => {
    const res = await h.create(ctx({ body: { title: 'g', progress: 100 } }));
    expect((res.body as Goal).progress).toBe(100);
  });

  it('derives progress from milestones server-side, overriding any sent progress', async () => {
    const res = await h.create(
      ctx({
        body: {
          title: 'g',
          progress: 5, // ignored: milestones drive progress
          milestones: [{ label: 'a', completed: true }, { label: 'b' }],
        },
      }),
    );
    expect((res.body as Goal).progress).toBe(50);
  });

  it('stamps milestone ids and completedDate', async () => {
    const res = await h.create(
      ctx({ body: { title: 'g', milestones: [{ label: 'done one', completed: true }, { label: 'todo' }] } }),
    );
    const ms = (res.body as Goal).milestones ?? [];
    expect(ms[0]?.id).toBeTruthy();
    expect(ms[0]?.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ms[1]?.completed).toBe(false);
    expect(ms[1]?.completedDate).toBeUndefined();
  });

  it('422s on invalid input (missing title, bad category, bad progress, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { description: 'no title' } })), 422);
    await expectStatus(h.create(ctx({ body: { title: 't', category: 'nope' } })), 422);
    await expectStatus(h.create(ctx({ body: { title: 't', progress: 50.5 } })), 422);
    await expectStatus(h.create(ctx({ body: { title: 't', progress: 250 } })), 422);
    await expectStatus(h.create(ctx({ body: { title: 't', progress: -10 } })), 422);
    await expectStatus(h.create(ctx({ body: { title: 't', bogus: 1 } })), 422);
  });
});

describe('list (GET /goals) — filtering', () => {
  beforeEach(async () => {
    await seedGoal({ title: 'A', period: 'Junior Year', status: 'in-progress', category: 'clinical' });
    await seedGoal({ title: 'B', period: 'Senior Year', status: 'completed', category: 'application' });
    await seedGoal({ title: 'C', period: 'Junior Year', status: 'not-started', category: 'academic' });
  });

  it('returns all goals with no filter', async () => {
    const res = await h.list(ctx());
    expect((res.body as { goals: Goal[] }).goals).toHaveLength(3);
  });

  it('filters by period', async () => {
    const res = await h.list(ctx({ query: { period: 'Junior Year' } }));
    expect((res.body as { goals: Goal[] }).goals).toHaveLength(2);
  });

  it('filters by status', async () => {
    const res = await h.list(ctx({ query: { status: 'completed' } }));
    const goals = (res.body as { goals: Goal[] }).goals;
    expect(goals).toHaveLength(1);
    expect(goals[0]?.title).toBe('B');
  });

  it('filters by category', async () => {
    const res = await h.list(ctx({ query: { category: 'clinical' } }));
    expect((res.body as { goals: Goal[] }).goals).toHaveLength(1);
  });

  it('422s on an invalid status filter', async () => {
    await expectStatus(h.list(ctx({ query: { status: 'bogus' } })), 422);
  });

  it('orders by target date (soonest first); undated goals go last', async () => {
    await seedGoal({ title: 'Later', targetDate: '2027-05-01' });
    await seedGoal({ title: 'Soon', targetDate: '2026-09-01' });
    await seedGoal({ title: 'Mid', targetDate: '2027-01-15' });
    const goals = ((await h.list(ctx())).body as { goals: Goal[] }).goals;
    expect(goals.filter((g) => g.targetDate).map((g) => g.title)).toEqual(['Soon', 'Mid', 'Later']);
    // The undated A/B/C from the outer beforeEach sink to the bottom.
    expect(new Set(goals.slice(-3).map((g) => g.title))).toEqual(new Set(['A', 'B', 'C']));
  });
});

describe('detail (GET /goals/:id)', () => {
  it('returns the goal', async () => {
    const id = await seedGoal({ title: 'Find one' });
    const res = await h.detail(ctx({ params: { id } }));
    expect(res.status).toBe(200);
    expect((res.body as Goal).title).toBe('Find one');
  });

  it('404 when missing', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('update (PUT /goals/:id)', () => {
  it('updates progress and status', async () => {
    const id = await seedGoal();
    const res = await h.update(ctx({ params: { id }, body: { status: 'in-progress', progress: 40 } }));
    expect(res.status).toBe(200);
    expect((res.body as Goal).status).toBe('in-progress');
    expect((res.body as Goal).progress).toBe(40);
  });

  it('422s on an out-of-range progress', async () => {
    const id = await seedGoal();
    await expectStatus(h.update(ctx({ params: { id }, body: { progress: 150 } })), 422);
  });

  it('re-stamps milestone completion on toggle and derives progress server-side', async () => {
    const id = await seedGoal();
    const res = await h.update(
      ctx({
        params: { id },
        body: {
          milestones: [
            { id: 'm1', label: 'a', completed: true },
            { id: 'm2', label: 'b', completed: false },
          ],
        },
      }),
    );
    const goal = res.body as Goal;
    expect(goal.milestones?.[0]?.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(goal.progress).toBe(50);
  });

  it('keeps progress milestone-derived even when a manual value is also sent', async () => {
    const id = await seedGoal({ milestones: [{ id: 'm1', label: 'a', completed: true }] });
    const res = await h.update(ctx({ params: { id }, body: { progress: 0 } }));
    expect((res.body as Goal).progress).toBe(100); // milestones win over the manual 0
  });

  it('persists a manual progress value when the goal has no milestones', async () => {
    const id = await seedGoal();
    const res = await h.update(ctx({ params: { id }, body: { progress: 60 } }));
    expect((res.body as Goal).progress).toBe(60);
  });

  it('404 when missing', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { title: 'x' } })), 404);
  });
});

describe('remove (DELETE /goals/:id)', () => {
  it('deletes (204) and the goal is gone', async () => {
    const id = await seedGoal();
    const res = await h.remove(ctx({ params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.goals.get(id)).toBeNull();
  });

  it('404 when missing', async () => {
    await expectStatus(h.remove(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('suggest (POST /goals/suggest)', () => {
  it('passes validated input to the suggester and returns suggestions (nothing persisted)', async () => {
    suggestResult = [{ title: 'Shadow a nurse', category: 'clinical' }];
    const res = await h.suggest(ctx({ body: { gradeLevel: 'junior', count: 3 } }));
    expect(res.status).toBe(200);
    expect((res.body as { suggestions: SuggestedGoal[] }).suggestions).toHaveLength(1);
    expect(suggestArg).toMatchObject({ gradeLevel: 'junior', count: 3 });
    // suggest never writes a goal
    expect(await data.goals.list()).toHaveLength(0);
  });

  it('422s on an invalid body (unknown field / bad count)', async () => {
    await expectStatus(h.suggest(ctx({ body: { count: 99 } })), 422);
    await expectStatus(h.suggest(ctx({ body: { bogus: true } })), 422);
  });
});

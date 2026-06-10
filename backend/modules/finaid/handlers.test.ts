import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type FinAidHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
let data: Data;
let h: FinAidHandlers;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data });
});
const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

describe('CRUD', () => {
  it('create defaults status to not-started', async () => {
    const res = await h.create(ctx({ body: { kind: 'institutional-aid', title: 'UCI aid form' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'not-started' });
  });
  it('422 on unknown field', async () => {
    await expect(h.create(ctx({ body: { kind: 'fafsa', title: 'x', nope: 1 } }))).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('seed', () => {
  it('creates FAFSA + CSS for the class year, idempotently', async () => {
    const first = await h.seed(ctx({ body: { classYear: 2029 } }));
    expect((first.body as { added: number }).added).toBe(2);
    const items = await data.finaid.list();
    expect(items.map((i) => i.kind).sort()).toEqual(['css-profile', 'fafsa']);
    expect(items.find((i) => i.kind === 'fafsa')?.deadline).toBe('2029-06-30');

    // Running again adds nothing.
    const second = await h.seed(ctx({ body: { classYear: 2029 } }));
    expect((second.body as { added: number }).added).toBe(0);
  });
});

describe('summary', () => {
  it('counts by status and reports the soonest deadline', async () => {
    await data.finaid.create({ kind: 'fafsa', title: 'FAFSA', deadline: '2029-06-30', status: 'not-started' } as Parameters<Data['finaid']['create']>[0]);
    await data.finaid.create({ kind: 'css-profile', title: 'CSS', deadline: '2028-11-01', status: 'submitted' } as Parameters<Data['finaid']['create']>[0]);
    const res = await h.summary(ctx());
    const body = res.body as { total: number; byStatus: Record<string, number>; nearestDeadline: { deadline: string } };
    expect(body.total).toBe(2);
    expect(body.byStatus['not-started']).toBe(1);
    expect(body.nearestDeadline.deadline).toBe('2028-11-01');
  });
});

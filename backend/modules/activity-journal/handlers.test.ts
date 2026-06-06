import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type JournalHandlers } from './handlers.js';
import type { ActivitySummary } from './summary.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
let h: JournalHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data);
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

/** Seed an activity directly via the data layer (bypassing the create handler). */
async function seedActivity(over: Record<string, unknown> = {}): Promise<string> {
  const a = await data.activities.create({
    userId: 'keira',
    date: '2026-01-10',
    category: 'volunteer',
    title: 'Seed',
    visibility: 'family',
    ...over,
  } as Parameters<Data['activities']['create']>[0]);
  return a.activityId;
}

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

describe('create (POST /activities)', () => {
  it('defaults visibility to family and records the creator as userId', async () => {
    const res = await h.create(ctx({ requester: kate, body: { date: '2026-02-01', category: 'academic', title: 'AP Bio A' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ visibility: 'family', userId: 'kate', title: 'AP Bio A' });
  });

  it('lets Keira mark an entry private', async () => {
    const res = await h.create(ctx({ body: { date: '2026-02-01', category: 'personal', title: 'x', visibility: 'private' } }));
    expect(res.status).toBe(201);
    expect((res.body as { visibility: string }).visibility).toBe('private');
  });

  it('FORBIDS a parent from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: kate, body: { date: '2026-02-01', category: 'personal', title: 'x', visibility: 'private' } })),
      403,
    );
  });

  it('FORBIDS an admin from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: grahem, body: { date: '2026-02-01', category: 'personal', title: 'x', visibility: 'private' } })),
      403,
    );
  });

  it('422s on invalid input (missing title, bad date, bad category, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', category: 'academic' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: 'Feb 1', category: 'academic', title: 't' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', category: 'nope', title: 't' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', category: 'academic', title: 't', bogus: 1 } })), 422);
  });
});

describe('list (GET /activities) — visibility filtering', () => {
  beforeEach(async () => {
    await seedActivity({ title: 'Family one', visibility: 'family', category: 'volunteer', date: '2026-01-01' });
    await seedActivity({ title: 'Private one', visibility: 'private', category: 'personal', date: '2026-01-02' });
  });

  it('Keira sees BOTH family and private', async () => {
    const res = await h.list(ctx({ requester: keira }));
    expect((res.body as { activities: unknown[] }).activities).toHaveLength(2);
  });

  it('a parent sees ONLY family (private hidden)', async () => {
    const res = await h.list(ctx({ requester: kate }));
    const items = (res.body as { activities: { visibility: string }[] }).activities;
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe('family');
  });

  it('an admin sees ONLY family (not privileged for private)', async () => {
    const res = await h.list(ctx({ requester: grahem }));
    expect((res.body as { activities: unknown[] }).activities).toHaveLength(1);
  });

  it('filters by category', async () => {
    const res = await h.list(ctx({ requester: keira, query: { category: 'volunteer' } }));
    const items = (res.body as { activities: { category: string }[] }).activities;
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe('volunteer');
  });

  it('filters by date range (and still hides private from a parent)', async () => {
    const res = await h.list(ctx({ requester: kate, query: { from: '2026-01-01', to: '2026-01-31' } }));
    expect((res.body as { activities: unknown[] }).activities).toHaveLength(1);
  });
});

describe('detail (GET /activities/:id)', () => {
  it('a parent gets 403 on a private entry, 200 on a family entry', async () => {
    const privateId = await seedActivity({ visibility: 'private' });
    const familyId = await seedActivity({ visibility: 'family' });
    await expectStatus(h.detail(ctx({ requester: kate, params: { id: privateId } })), 403);
    const ok = await h.detail(ctx({ requester: kate, params: { id: familyId } }));
    expect(ok.status).toBe(200);
  });

  it('Keira can read her private entry', async () => {
    const id = await seedActivity({ visibility: 'private' });
    const res = await h.detail(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(200);
  });

  it('404 when missing', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('update (PUT /activities/:id)', () => {
  it('a parent cannot update a private entry (403)', async () => {
    const id = await seedActivity({ visibility: 'private' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { title: 'hacked' } })), 403);
  });

  it('a parent cannot flip a family entry to private (403)', async () => {
    const id = await seedActivity({ visibility: 'family' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { visibility: 'private' } })), 403);
  });

  it('Keira can update her private entry', async () => {
    const id = await seedActivity({ visibility: 'private' });
    const res = await h.update(ctx({ requester: keira, params: { id }, body: { title: 'Updated' } }));
    expect(res.status).toBe(200);
    expect((res.body as { title: string }).title).toBe('Updated');
  });

  it('404 when missing', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { title: 'x' } })), 404);
  });
});

describe('remove (DELETE /activities/:id)', () => {
  it('a parent cannot delete a private entry (403)', async () => {
    const id = await seedActivity({ visibility: 'private' });
    await expectStatus(h.remove(ctx({ requester: kate, params: { id } })), 403);
    expect(await data.activities.get(id)).not.toBeNull(); // still there
  });

  it('Keira can delete her private entry (204)', async () => {
    const id = await seedActivity({ visibility: 'private' });
    const res = await h.remove(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.activities.get(id)).toBeNull();
  });
});

describe('summary (GET /activities/summary) — visibility filtering', () => {
  beforeEach(async () => {
    await seedActivity({ category: 'volunteer', hours: 3, visibility: 'family', date: '2026-01-05' });
    await seedActivity({ category: 'personal', hours: 5, visibility: 'private', date: '2026-02-05' });
  });

  it('Keira’s summary includes private hours', async () => {
    const res = await h.summary(ctx({ requester: keira }));
    const s = res.body as ActivitySummary;
    expect(s.totalHours).toBe(8);
    expect(s.totalCount).toBe(2);
  });

  it('a parent’s summary EXCLUDES private hours', async () => {
    const res = await h.summary(ctx({ requester: kate }));
    const s = res.body as ActivitySummary;
    expect(s.totalHours).toBe(3);
    expect(s.totalCount).toBe(1);
    expect(s.hoursByCategory.personal).toBeUndefined();
  });
});

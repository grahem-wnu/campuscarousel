import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { aiVisibleSet } from '../../shared/auth/index.js';
import { makeHandlers, type WhyNursingHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
let h: WhyNursingHandlers;

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

/** Seed an entry directly via the data layer (bypassing the create handler). */
async function seedEntry(over: Record<string, unknown> = {}): Promise<string> {
  const e = await data.whyNursing.create({
    date: '2026-01-10',
    title: 'Seed',
    content: 'A moment that mattered.',
    category: 'moment',
    visibility: 'family',
    ...over,
  } as Parameters<Data['whyNursing']['create']>[0]);
  return e.entryId;
}

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

describe('create (POST /why-nursing)', () => {
  it('defaults visibility to family', async () => {
    const res = await h.create(
      ctx({ requester: kate, body: { date: '2026-02-01', title: 'A talk with my aunt', content: 'She is an ICU nurse.' } }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ visibility: 'family', title: 'A talk with my aunt' });
  });

  it('lets Keira mark an entry private', async () => {
    const res = await h.create(
      ctx({ body: { date: '2026-02-01', title: 'Why I cried today', content: '…', visibility: 'private' } }),
    );
    expect(res.status).toBe(201);
    expect((res.body as { visibility: string }).visibility).toBe('private');
  });

  it('FORBIDS a parent from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: kate, body: { date: '2026-02-01', title: 'x', content: 'y', visibility: 'private' } })),
      403,
    );
  });

  it('FORBIDS an admin from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: grahem, body: { date: '2026-02-01', title: 'x', content: 'y', visibility: 'private' } })),
      403,
    );
  });

  it('accepts optional category, links and tags', async () => {
    const res = await h.create(
      ctx({
        body: {
          date: '2026-02-01',
          title: 'Shadowing day',
          content: 'Watched a code blue.',
          category: 'experience',
          linkedActivityId: 'act-1',
          linkedClinicalId: 'clin-1',
          tags: ['icu', 'observation'],
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'experience', linkedActivityId: 'act-1', linkedClinicalId: 'clin-1' });
  });

  it('422s on invalid input (missing title, missing content, bad date, bad category, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', content: 'c' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', title: 't' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: 'Feb 1', title: 't', content: 'c' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', title: 't', content: 'c', category: 'nope' } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', title: 't', content: 'c', bogus: 1 } })), 422);
  });
});

describe('list (GET /why-nursing) — visibility filtering', () => {
  beforeEach(async () => {
    await seedEntry({ title: 'Family one', visibility: 'family', category: 'moment', date: '2026-01-01' });
    await seedEntry({ title: 'Private one', visibility: 'private', category: 'realization', date: '2026-01-02' });
  });

  it('Keira sees BOTH family and private', async () => {
    const res = await h.list(ctx({ requester: keira }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('a parent sees ONLY family (private hidden)', async () => {
    const res = await h.list(ctx({ requester: kate }));
    const items = (res.body as { entries: { visibility: string }[] }).entries;
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe('family');
  });

  it('an admin sees ONLY family (not privileged for private)', async () => {
    const res = await h.list(ctx({ requester: grahem }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it('filters by category (and still hides private from a parent)', async () => {
    // The private entry is the only `realization`; a parent filtering for it gets nothing.
    const res = await h.list(ctx({ requester: kate, query: { category: 'realization' } }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it('filters by category for Keira', async () => {
    const res = await h.list(ctx({ requester: keira, query: { category: 'moment' } }));
    const items = (res.body as { entries: { category: string }[] }).entries;
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe('moment');
  });

  it('filters by date range (and still hides private from a parent)', async () => {
    const res = await h.list(ctx({ requester: kate, query: { from: '2026-01-01', to: '2026-01-31' } }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(1);
  });
});

describe('detail (GET /why-nursing/:id)', () => {
  it('a parent gets 403 on a private entry, 200 on a family entry', async () => {
    const privateId = await seedEntry({ visibility: 'private' });
    const familyId = await seedEntry({ visibility: 'family' });
    await expectStatus(h.detail(ctx({ requester: kate, params: { id: privateId } })), 403);
    const ok = await h.detail(ctx({ requester: kate, params: { id: familyId } }));
    expect(ok.status).toBe(200);
  });

  it('Keira can read her private entry', async () => {
    const id = await seedEntry({ visibility: 'private' });
    const res = await h.detail(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(200);
  });

  it('404 when missing', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('update (PUT /why-nursing/:id)', () => {
  it('a parent cannot update a private entry (403)', async () => {
    const id = await seedEntry({ visibility: 'private' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { title: 'hacked' } })), 403);
  });

  it('a parent cannot flip a family entry to private (403)', async () => {
    const id = await seedEntry({ visibility: 'family' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { visibility: 'private' } })), 403);
  });

  it('an admin cannot update a private entry (not privileged for private)', async () => {
    const id = await seedEntry({ visibility: 'private' });
    await expectStatus(h.update(ctx({ requester: grahem, params: { id }, body: { title: 'hacked' } })), 403);
  });

  it('Keira can update her private entry', async () => {
    const id = await seedEntry({ visibility: 'private' });
    const res = await h.update(ctx({ requester: keira, params: { id }, body: { title: 'Updated' } }));
    expect(res.status).toBe(200);
    expect((res.body as { title: string }).title).toBe('Updated');
  });

  it('404 when missing', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { title: 'x' } })), 404);
  });
});

describe('remove (DELETE /why-nursing/:id)', () => {
  it('a parent cannot delete a private entry (403)', async () => {
    const id = await seedEntry({ visibility: 'private' });
    await expectStatus(h.remove(ctx({ requester: kate, params: { id } })), 403);
    expect(await data.whyNursing.get(id)).not.toBeNull(); // still there
  });

  it('an admin cannot delete a private entry (not privileged for private)', async () => {
    const id = await seedEntry({ visibility: 'private' });
    await expectStatus(h.remove(ctx({ requester: grahem, params: { id } })), 403);
    expect(await data.whyNursing.get(id)).not.toBeNull(); // still there
  });

  it('Keira can delete her private entry (204)', async () => {
    const id = await seedEntry({ visibility: 'private' });
    const res = await h.remove(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.whyNursing.get(id)).toBeNull();
  });
});

describe('AI visibility — private reaches the AI only when keira is the caller', () => {
  beforeEach(async () => {
    await seedEntry({ title: 'Family', visibility: 'family' });
    await seedEntry({ title: 'Private', visibility: 'private' });
  });

  it('the AI set for keira includes private entries', async () => {
    const all = await data.whyNursing.list();
    expect(aiVisibleSet(all, keira)).toHaveLength(2);
  });

  it('the AI set for a parent excludes private entries', async () => {
    const all = await data.whyNursing.list();
    expect(aiVisibleSet(all, kate)).toHaveLength(1);
    expect(aiVisibleSet(all, kate)[0]?.title).toBe('Family');
  });
});

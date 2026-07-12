import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data, type Scholarship } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type ScholarshipHandlers } from './handlers.js';
import type { DiscoveredScholarship, ScholarshipDiscoverer } from './discover.js';
import type { HydrationEnqueuer, InlineDispatcher } from './hydration.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: ScholarshipHandlers;
let discoverResult: DiscoveredScholarship[];
let enqueued: string[];
let enqueueImpl: (id: string) => Promise<void>;

const discoverer: ScholarshipDiscoverer = { discover: () => Promise.resolve(discoverResult) };
const enqueuer: HydrationEnqueuer = { enqueue: (id) => enqueueImpl(id) };
// Inline dispatcher fake: marks the scholarship hydrated and returns the updated record.
const dispatch: InlineDispatcher = (id) =>
  data.scholarships.update(id, { hydrationStatus: 'complete', provider: 'Hydrated Co' });

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => discoverer, () => dispatch, () => enqueuer);
  discoverResult = [];
  enqueued = [];
  enqueueImpl = (id) => {
    enqueued.push(id);
    return Promise.resolve();
  };
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seed(over: Partial<Scholarship> = {}): Promise<string> {
  const s = await data.scholarships.create({ name: 'Seed', status: 'discovered', ...over } as Parameters<
    Data['scholarships']['create']
  >[0]);
  return s.scholarshipId;
}

describe('create (POST /scholarships)', () => {
  it('creates with addedBy=manual and defaults status to discovered', async () => {
    const res = await h.create(ctx({ requester: kate, body: { name: 'Local Nurses Fund' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Local Nurses Fund', status: 'discovered', addedBy: 'manual' });
  });

  it('422s on invalid input (missing name, bad type, bad url, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { provider: 'x' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'n', type: 'nope' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'n', applicationUrl: 'not-a-url' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'n', bogus: 1 } })), 422);
  });
});

describe('list (GET /scholarships) — filtering', () => {
  beforeEach(async () => {
    await seed({ name: 'A', type: 'major-specific', status: 'applied', linkedColleges: ['c1'], applicationDeadline: '2026-03-01' });
    await seed({ name: 'B', type: 'merit', status: 'discovered', linkedColleges: ['c2'], applicationDeadline: '2026-09-01' });
    await seed({ name: 'C', type: 'major-specific', status: 'awarded' });
  });

  const list = async (query: Record<string, string> = {}) =>
    ((await h.list(ctx({ query }))).body as { scholarships: Scholarship[] }).scholarships;

  it('returns all with no filter', async () => expect(await list()).toHaveLength(3));
  it('filters by type', async () => expect(await list({ type: 'major-specific' })).toHaveLength(2));
  it('filters by status', async () => expect(await list({ status: 'awarded' })).toHaveLength(1));
  it('filters by linkedCollege', async () => expect(await list({ linkedCollege: 'c1' })).toHaveLength(1));
  it('filters by deadlineBefore (excludes no-deadline)', async () =>
    expect((await list({ deadlineBefore: '2026-06-01' })).map((s) => s.name)).toEqual(['A']));
});

describe('summary (GET /scholarships/summary)', () => {
  it('includes budget impact from the budget singleton', async () => {
    await data.budget.put({ totalBudget: 100_000 });
    await seed({ status: 'awarded', awardedAmount: 4_000 });
    await seed({ status: 'applied', amount: 2_000 });
    const res = await h.summary(ctx());
    expect(res.body).toMatchObject({
      totalTracked: 2,
      totalAwarded: 4_000,
      budget: { totalBudget: 100_000, adjustedRemaining: 96_000 },
    });
  });
});

describe('detail / update / remove', () => {
  it('detail returns the scholarship; 404 when missing', async () => {
    const id = await seed({ name: 'Find me' });
    expect((await h.detail(ctx({ params: { id } }))).status).toBe(200);
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });
  it('update changes status; 404 when missing', async () => {
    const id = await seed();
    expect(((await h.update(ctx({ params: { id }, body: { status: 'applied' } }))).body as Scholarship).status).toBe('applied');
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { status: 'applied' } })), 404);
  });
  it('remove deletes (204); 404 when missing', async () => {
    const id = await seed();
    expect((await h.remove(ctx({ params: { id } }))).status).toBe(204);
    expect(await data.scholarships.get(id)).toBeNull();
    await expectStatus(h.remove(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('discover (POST /scholarships/discover)', () => {
  it('returns results from the discoverer and persists nothing', async () => {
    discoverResult = [{ name: 'Found', type: 'merit' }];
    const res = await h.discover(ctx({ body: { query: 'nursing', count: 3 } }));
    expect(res.status).toBe(200);
    expect((res.body as { results: DiscoveredScholarship[] }).results).toHaveLength(1);
    expect(await data.scholarships.list()).toHaveLength(0);
  });
  it('422s on a bad body', async () => {
    await expectStatus(h.discover(ctx({ body: { count: 99 } })), 422);
  });
});

describe('bulkAdd (POST /scholarships/bulk-add)', () => {
  it('saves all as ai-discovered even when hydration enqueue fails (no false pending)', async () => {
    enqueueImpl = () => Promise.reject(new Error('queue down'));
    const res = await h.bulkAdd(ctx({ body: { hydrate: true, scholarships: [{ name: 'One' }, { name: 'Two' }] } }));
    expect(res.status).toBe(201);
    const saved = (res.body as { scholarships: Scholarship[] }).scholarships;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ addedBy: 'ai-discovered' });
    expect(saved[0]?.hydrationStatus).toBeUndefined();
    expect(await data.scholarships.list()).toHaveLength(2);
  });

  it('enqueues per item and marks pending when hydrate=true and the queue is up', async () => {
    const res = await h.bulkAdd(ctx({ body: { hydrate: true, scholarships: [{ name: 'One' }, { name: 'Two' }] } }));
    expect(enqueued).toHaveLength(2);
    expect((res.body as { scholarships: Scholarship[] }).scholarships[0]?.hydrationStatus).toBe('pending');
  });

  it('does not enqueue when hydrate is omitted', async () => {
    await h.bulkAdd(ctx({ body: { scholarships: [{ name: 'One' }] } }));
    expect(enqueued).toHaveLength(0);
  });

  it('422s on an empty list', async () => {
    await expectStatus(h.bulkAdd(ctx({ body: { scholarships: [] } })), 422);
  });
});

describe('hydrate (POST /scholarships/:id/hydrate)', () => {
  it('hydrates inline and returns the updated record with a terminal status (200)', async () => {
    const id = await seed({ name: 'Refresh me' });
    const res = await h.hydrate(ctx({ params: { id } }));
    expect(res.status).toBe(200);
    expect((res.body as Scholarship).hydrationStatus).toBe('complete');
    expect((res.body as Scholarship).provider).toBe('Hydrated Co');
  });

  it('404 when missing', async () => {
    await expectStatus(h.hydrate(ctx({ params: { id: 'ghost' } })), 404);
  });
});

// Silence the expected console.error from the bulk-add enqueue-failure path.
vi.spyOn(console, 'error').mockImplementation(() => undefined);

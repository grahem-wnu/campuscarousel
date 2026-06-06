import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type CollegeHandlers } from './handlers.js';
import type { Discoverer } from './ai.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: CollegeHandlers;
let dispatched: string[];

// Stub dispatcher: records the call and simulates hydration (fills a field, marks complete),
// honoring userEdited via mergePreservingUserEdits.
const makeDispatch = () => async (id: string) => {
  dispatched.push(id);
  await data.colleges.mergePreservingUserEdits(id, { location: 'AI City', hydrationStatus: 'complete' });
};

const stubDiscoverer: Discoverer = async (input) => [
  { name: 'Discovered U', state: input.state ?? 'Ohio', programType: 'direct-admit-BSN' },
];

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatched = [];
  h = makeHandlers({ getData: () => data, discoverer: stubDiscoverer, dispatch: makeDispatch() });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});
const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function create(body: Record<string, unknown>) {
  const res = await h.create(ctx({ body }));
  return res.body as { collegeId: string; [k: string]: unknown };
}

describe('create (POST /colleges)', () => {
  it('creates from just a name, auto-hydrates, and records the creator path', async () => {
    const res = await h.create(ctx({ body: { name: 'Ohio State' } }));
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body.name).toBe('Ohio State');
    expect(body.status).toBe('researching');
    expect(body.addedBy).toBe('manual');
    expect(body.location).toBe('AI City'); // hydration ran via dispatch
    expect(dispatched).toHaveLength(1);
  });

  it('marks caller-supplied fields userEdited so hydration cannot overwrite them', async () => {
    const body = await create({ name: 'Ohio State', ranking: 'My pick', location: 'My City' });
    // dispatch tried to set location='AI City' but the user supplied it → preserved
    expect(body.location).toBe('My City');
    expect(body.ranking).toBe('My pick');
    expect(body.userEdited).toEqual(expect.arrayContaining(['name', 'ranking', 'location']));
  });

  it('422s on missing name / unknown field', async () => {
    await expectStatus(h.create(ctx({ body: {} })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'X', bogus: 1 } })), 422);
  });
});

describe('list (GET /colleges)', () => {
  beforeEach(async () => {
    await create({ name: 'Alpha', status: 'target' });
    await create({ name: 'Bravo', status: 'researching' });
    const gone = await create({ name: 'Gone' });
    await h.remove(ctx({ params: { id: gone.collegeId } }));
  });

  it('lists non-removed by default, name-sorted', async () => {
    const res = await h.list(ctx());
    expect((res.body as { colleges: { name: string }[] }).colleges.map((c) => c.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('includeRemoved=true surfaces soft-deleted', async () => {
    const res = await h.list(ctx({ query: { includeRemoved: 'true' } }));
    expect((res.body as { colleges: unknown[] }).colleges).toHaveLength(3);
  });

  it('filters by status', async () => {
    const res = await h.list(ctx({ query: { status: 'target' } }));
    expect((res.body as { colleges: { name: string }[] }).colleges.map((c) => c.name)).toEqual(['Alpha']);
  });
});

describe('detail / update / remove / top-pick', () => {
  it('detail 404s for a missing college', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('update edits and records userEdited; 404 when missing', async () => {
    const c = await create({ name: 'Ohio State' });
    const res = await h.update(ctx({ params: { id: c.collegeId }, body: { ranking: 'Top 25' } }));
    expect((res.body as { ranking: string }).ranking).toBe('Top 25');
    expect((res.body as { userEdited: string[] }).userEdited).toContain('ranking');
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { ranking: 'x' } })), 404);
  });

  it('remove soft-deletes (status → removed)', async () => {
    const c = await create({ name: 'Ohio State' });
    const res = await h.remove(ctx({ params: { id: c.collegeId } }));
    expect((res.body as { status: string }).status).toBe('removed');
    expect(await data.colleges.get(c.collegeId)).not.toBeNull(); // still present (soft)
  });

  it('top-pick toggles isTopPick', async () => {
    const c = await create({ name: 'Ohio State' });
    const res = await h.topPick(ctx({ params: { id: c.collegeId }, body: { isTopPick: true } }));
    expect((res.body as { isTopPick: boolean }).isTopPick).toBe(true);
    await expectStatus(h.topPick(ctx({ params: { id: c.collegeId }, body: { isTopPick: 'yes' } })), 422);
  });
});

describe('hydrate / hydrate-all', () => {
  it('hydrate returns 202 and dispatches', async () => {
    const c = await create({ name: 'Ohio State' });
    dispatched = [];
    const res = await h.hydrate(ctx({ params: { id: c.collegeId } }));
    expect(res.status).toBe(202);
    expect(dispatched).toEqual([c.collegeId]);
  });

  it('hydrate 404s for a missing college', async () => {
    await expectStatus(h.hydrate(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('hydrate-all dispatches every non-removed college', async () => {
    await create({ name: 'A' });
    await create({ name: 'B' });
    const gone = await create({ name: 'C' });
    await h.remove(ctx({ params: { id: gone.collegeId } }));
    dispatched = [];
    const res = await h.hydrateAll(ctx());
    expect(res.status).toBe(202);
    expect((res.body as { requested: number }).requested).toBe(2);
    expect(dispatched).toHaveLength(2);
  });
});

describe('discover / bulk-add', () => {
  it('discover returns candidates without adding anything', async () => {
    const res = await h.discover(ctx({ body: { state: 'Ohio' } }));
    expect((res.body as { candidates: { name: string }[] }).candidates[0]?.name).toBe('Discovered U');
    expect((await data.colleges.list())).toHaveLength(0); // nothing persisted
  });

  it('bulk-add creates several at once', async () => {
    const res = await h.bulkAdd(
      ctx({ body: { colleges: [{ name: 'A', state: 'Ohio' }, { name: 'B' }] } }),
    );
    expect(res.status).toBe(201);
    expect((res.body as { created: unknown[] }).created).toHaveLength(2);
    expect((await data.colleges.list())).toHaveLength(2);
  });

  it('422s on an empty bulk-add', async () => {
    await expectStatus(h.bulkAdd(ctx({ body: { colleges: [] } })), 422);
  });
});

describe('notes / checklist', () => {
  it('adds and lists notes (author defaults to the JWT username)', async () => {
    const c = await create({ name: 'Ohio State' });
    const added = await h.addNote(ctx({ requester: kate, params: { id: c.collegeId }, body: { content: 'Visited!' } }));
    expect((added.body as { author: string }).author).toBe('kate');
    const list = await h.listNotes(ctx({ params: { id: c.collegeId } }));
    expect((list.body as { notes: { content: string }[] }).notes.map((n) => n.content)).toEqual(['Visited!']);
  });

  it('note add 404s for a missing college', async () => {
    await expectStatus(h.addNote(ctx({ params: { id: 'ghost' }, body: { content: 'x' } })), 404);
  });

  it('puts a checklist', async () => {
    const c = await create({ name: 'Ohio State' });
    const res = await h.putChecklist(
      ctx({ params: { id: c.collegeId }, body: { items: [{ id: 'app', label: 'Apply', completed: false }] } }),
    );
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });
});

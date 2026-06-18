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
let assetsDispatched: string[];

// Stub dispatcher: records the call and simulates hydration (fills a field, marks complete),
// honoring userEdited via mergePreservingUserEdits.
const makeDispatch = () => async (id: string) => {
  dispatched.push(id);
  await data.colleges.mergePreservingUserEdits(id, { location: 'AI City', hydrationStatus: 'complete' });
};

// Stub assets dispatcher: records the call and simulates the imagery worker landing a campus url.
const makeAssetsDispatch = () => async (id: string) => {
  assetsDispatched.push(id);
  await data.colleges.mergePreservingUserEdits(id, {
    campusImageUrl: `https://cdn.test/colleges/${id}/campus.jpg`,
    assetsStatus: 'complete',
  });
};

const stubDiscoverer: Discoverer = async (input) => [
  { name: 'Discovered U', state: input.state ?? 'Ohio', programType: 'direct-admit' },
];

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatched = [];
  assetsDispatched = [];
  h = makeHandlers({
    getData: () => data,
    discoverer: stubDiscoverer,
    dispatch: makeDispatch(),
    assetsDispatch: makeAssetsDispatch(),
  });
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
    // Imagery fetch is kicked off in parallel and lands a campus url.
    expect(assetsDispatched).toEqual([body.collegeId]);
    expect(body.campusImageUrl).toBe(`https://cdn.test/colleges/${body.collegeId}/campus.jpg`);
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

  it('409s when the same college (normalized name) is already tracked', async () => {
    await create({ name: 'Ohio State University' });
    await expectStatus(h.create(ctx({ body: { name: '  ohio state   university ' } })), 409);
  });

  it('allows re-adding a name after the prior one was soft-deleted', async () => {
    const c = await create({ name: 'Purdue' });
    await h.remove(ctx({ params: { id: c.collegeId } }));
    const again = await h.create(ctx({ body: { name: 'Purdue' } }));
    expect(again.status).toBe(201);
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

  it('hydrate-all dispatches every non-removed college (text + imagery)', async () => {
    await create({ name: 'A' });
    await create({ name: 'B' });
    const gone = await create({ name: 'C' });
    await h.remove(ctx({ params: { id: gone.collegeId } }));
    dispatched = [];
    assetsDispatched = [];
    const res = await h.hydrateAll(ctx());
    expect(res.status).toBe(202);
    expect((res.body as { requested: number }).requested).toBe(2);
    expect(dispatched).toHaveLength(2);
    expect(assetsDispatched).toHaveLength(2);
  });

  it('hydrate also kicks off an imagery refresh', async () => {
    const c = await create({ name: 'Ohio State' });
    assetsDispatched = [];
    await h.hydrate(ctx({ params: { id: c.collegeId } }));
    expect(assetsDispatched).toEqual([c.collegeId]);
  });
});

describe('assets-backfill (POST /colleges/assets-backfill)', () => {
  it('enqueues imagery only for non-removed colleges that lack a campus photo', async () => {
    // `create` auto-runs the stub assets dispatch, which lands a campusImageUrl — so seed colleges
    // WITHOUT imagery directly via the data layer to exercise the backfill filter.
    const withImg = await create({ name: 'Has Image' }); // gets campusImageUrl from the stub
    const a = await data.colleges.create({ name: 'Needs A', userEdited: [] } as Parameters<Data['colleges']['create']>[0]);
    const b = await data.colleges.create({ name: 'Needs B', userEdited: [] } as Parameters<Data['colleges']['create']>[0]);
    const gone = await data.colleges.create({ name: 'Gone', status: 'removed', userEdited: [] } as Parameters<Data['colleges']['create']>[0]);
    assetsDispatched = [];

    const res = await h.assetsBackfill(ctx());

    expect(res.status).toBe(202);
    expect((res.body as { requested: number }).requested).toBe(2);
    expect(assetsDispatched.sort()).toEqual([a.collegeId, b.collegeId].sort());
    expect(assetsDispatched).not.toContain(withImg.collegeId);
    expect(assetsDispatched).not.toContain(gone.collegeId);
  });
});

describe('discover / bulk-add', () => {
  it('discover starts an async job (202) that the stub runs inline, pollable by id, adds nothing', async () => {
    const res = await h.discover(ctx({ body: { state: 'Ohio' } }));
    expect(res.status).toBe(202);
    const job = res.body as { jobId: string; status: string; candidates?: { name: string }[] };
    expect(job.jobId).toBeTruthy();
    expect(job.status).toBe('complete'); // inline stub run
    expect(job.candidates?.[0]?.name).toBe('Discovered U');
    expect(await data.colleges.list()).toHaveLength(0); // nothing persisted

    // The job is pollable via the status endpoint.
    const poll = await h.discoverStatus(ctx({ params: { jobId: job.jobId } }));
    expect(poll.status).toBe(200);
    expect((poll.body as { candidates: { name: string }[] }).candidates[0]?.name).toBe('Discovered U');
  });

  it('discoverStatus 404s an unknown job id', async () => {
    await expect(h.discoverStatus(ctx({ params: { jobId: 'nope' } }))).rejects.toBeTruthy();
  });

  it('bulk-add creates several at once', async () => {
    const res = await h.bulkAdd(
      ctx({ body: { colleges: [{ name: 'A', state: 'Ohio' }, { name: 'B' }] } }),
    );
    expect(res.status).toBe(201);
    expect((res.body as { created: unknown[] }).created).toHaveLength(2);
    expect((await data.colleges.list())).toHaveLength(2);
  });

  it('bulk-add skips colleges already tracked or duplicated within the batch', async () => {
    await create({ name: 'Existing U' });
    const res = await h.bulkAdd(
      ctx({ body: { colleges: [{ name: 'existing u' }, { name: 'New U' }, { name: 'new u' }] } }),
    );
    const body = res.body as { created: { name: string }[]; skipped: string[] };
    expect(body.created.map((c) => c.name)).toEqual(['New U']);
    expect(body.skipped).toEqual(['existing u', 'new u']);
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

  it('ignores a client-supplied author (no identity spoofing)', async () => {
    const c = await create({ name: 'Kent State' });
    // kate tries to forge a note as keira; the extra key is rejected by .strict() (422).
    await expectStatus(
      h.addNote(ctx({ requester: kate, params: { id: c.collegeId }, body: { content: 'x', author: 'keira' } })),
      422,
    );
  });

  it('note add 404s for a missing college', async () => {
    await expectStatus(h.addNote(ctx({ params: { id: 'ghost' }, body: { content: 'x' } })), 404);
  });

  it('puts then gets a checklist (empty shell before first save)', async () => {
    const c = await create({ name: 'Ohio State' });
    const empty = await h.getChecklist(ctx({ params: { id: c.collegeId } }));
    expect((empty.body as { items: unknown[] }).items).toHaveLength(0);

    await h.putChecklist(
      ctx({ params: { id: c.collegeId }, body: { items: [{ id: 'app', label: 'Apply', completed: false }] } }),
    );
    const got = await h.getChecklist(ctx({ params: { id: c.collegeId } }));
    expect((got.body as { items: { label: string }[] }).items.map((i) => i.label)).toEqual(['Apply']);
  });

  it('suggestChecklist returns AI steps (college + majors passed through; nothing persisted)', async () => {
    let seenCollege = '';
    let seenMajors: string[] = [];
    const hh = makeHandlers({
      getData: () => data,
      dispatch: makeDispatch(),
      assetsDispatch: makeAssetsDispatch(),
      checklistSuggester: async (college, majors) => {
        seenCollege = college.name;
        seenMajors = majors;
        return [{ label: 'Submit the TEAS exam score' }, { label: 'Pay the application fee', dueDate: '2026-11-01' }];
      },
    });
    const c = await create({ name: 'Ohio State' });
    await data.studentProfile.put({ onboardingComplete: true, intendedMajors: ['Nursing (BSN)'] });

    const res = await hh.suggestChecklist(ctx({ params: { id: c.collegeId } }));
    const { suggestions } = res.body as { suggestions: { label: string; dueDate?: string }[] };
    expect(suggestions.map((s) => s.label)).toEqual(['Submit the TEAS exam score', 'Pay the application fee']);
    expect(suggestions[1]?.dueDate).toBe('2026-11-01');
    expect(seenCollege).toBe('Ohio State');
    expect(seenMajors).toEqual(['Nursing (BSN)']);

    // Pure suggestion endpoint — it must not write a checklist.
    const got = await hh.getChecklist(ctx({ params: { id: c.collegeId } }));
    expect((got.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('suggestChecklist 404s for a missing college', async () => {
    await expectStatus(h.suggestChecklist(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('generatePrep returns the plan, passes college+major+gradYear through, and persists it on the college', async () => {
    let seen: { name: string; majors: string[]; gradYear?: number } = { name: '', majors: [] };
    const plan = { headline: 'Aim high', targets: [{ label: '3.5 GPA' }], courses: [{ label: 'AP Physics 1' }], activities: [{ label: 'Robotics' }] };
    const hh = makeHandlers({
      getData: () => data,
      dispatch: makeDispatch(),
      assetsDispatch: makeAssetsDispatch(),
      prepSuggester: async (college, majors, gradYear) => {
        seen = { name: college.name, majors, gradYear };
        return plan;
      },
    });
    const c = await create({ name: 'Ohio State' });
    await data.studentProfile.put({ onboardingComplete: true, intendedMajors: ['Nursing (BSN)'], graduationYear: 2028 });

    const res = await hh.generatePrep(ctx({ params: { id: c.collegeId } }));
    expect((res.body as { plan: typeof plan }).plan.courses[0]?.label).toBe('AP Physics 1');
    expect(seen).toEqual({ name: 'Ohio State', majors: ['Nursing (BSN)'], gradYear: 2028 });
    // Persisted onto the college so it survives a reload.
    const after = await data.colleges.get(c.collegeId);
    expect(after?.hsPrepPlan?.headline).toBe('Aim high');
  });

  it('generatePrep returns { plan: null } when the model produced nothing (and persists nothing)', async () => {
    const hh = makeHandlers({ getData: () => data, dispatch: makeDispatch(), assetsDispatch: makeAssetsDispatch(), prepSuggester: async () => null });
    const c = await create({ name: 'Kent State' });
    const res = await hh.generatePrep(ctx({ params: { id: c.collegeId } }));
    expect((res.body as { plan: unknown }).plan).toBeNull();
    expect((await data.colleges.get(c.collegeId))?.hsPrepPlan).toBeUndefined();
  });

  it('generatePrep 404s for a missing college', async () => {
    await expectStatus(h.generatePrep(ctx({ params: { id: 'ghost' } })), 404);
  });
});

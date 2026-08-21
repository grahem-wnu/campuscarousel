// Handler tests: status codes, 404s, validation, and the dispatch seams. The dispatchers are stubs
// that stand in for the SQS worker, so the whole request/response contract is exercised without AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, buildRoutes, type ScholarshipHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };

let data: Data;
let h: ScholarshipHandlers;
let collegeId: string;
let searchCalls: string[];
let researchCalls: [string, string][];

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  searchCalls = [];
  researchCalls = [];
  const college = await data.colleges.create({ name: 'Ohio State University', state: 'Ohio' });
  collegeId = college.collegeId;
  h = makeHandlers({
    getData: () => data,
    // Stand in for the worker: record the call and land a plausible result.
    searchDispatch: async (id) => {
      searchCalls.push(id);
      await data.collegeScholarships.add(id, { name: 'Morrill Scholarship', category: 'academic' });
      await data.collegeScholarshipSearch.patch(id, { status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00.000Z' });
    },
    researchDispatch: async (id, scholarshipId) => {
      researchCalls.push([id, scholarshipId]);
      await data.collegeScholarships.update(id, scholarshipId, {
        research: { summary: 'A dossier.' },
        researchStatus: 'complete',
      });
    },
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

describe('GET /colleges/:id/scholarships', () => {
  it('returns an empty shape before any search has run', async () => {
    const res = await h.list(ctx({ params: { id: collegeId } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ search: null, scholarships: [] });
  });

  it('404s for a college that does not exist', async () => {
    await expectStatus(h.list(ctx({ params: { id: 'nope' } })), 404);
  });
});

describe('POST /colleges/:id/scholarships/search', () => {
  it('starts a search and returns 202 with the current state', async () => {
    const res = await h.search(ctx({ params: { id: collegeId }, body: {} }));
    expect(res.status).toBe(202);
    expect(searchCalls).toEqual([collegeId]);
    const body = res.body as { search: { status: string; category: string }; scholarships: unknown[] };
    expect(body.search.status).toBe('complete'); // the stub dispatcher ran inline
    expect(body.scholarships).toHaveLength(1);
  });

  it('defaults to an "all" sweep', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: {} }));
    expect((await data.collegeScholarshipSearch.get(collegeId))?.category).toBe('all');
  });

  it('records the requested category and sport for the worker to read back', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: { category: 'athletic', sport: 'rowing' } }));
    const state = await data.collegeScholarshipSearch.get(collegeId);
    expect(state?.category).toBe('athletic');
    expect(state?.sport).toBe('rowing');
  });

  it('clears a previous error when a new search starts', async () => {
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'failed', error: 'boom' });
    await h.search(ctx({ params: { id: collegeId }, body: {} }));
    expect((await data.collegeScholarshipSearch.get(collegeId))?.error).toBeUndefined();
  });

  it('persists the family’s query so the worker can read it back', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: { query: 'soccer' } }));
    expect((await data.collegeScholarshipSearch.get(collegeId))?.query).toBe('soccer');
  });

  it('treats a blank query as a broad sweep, not a search for nothing', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: { query: '   ' } }));
    expect((await data.collegeScholarshipSearch.get(collegeId))?.query).toBeUndefined();
  });

  it('clears a previous query when a broad sweep follows a targeted search', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: { query: 'soccer' } }));
    await h.search(ctx({ params: { id: collegeId }, body: {} }));
    expect((await data.collegeScholarshipSearch.get(collegeId))?.query).toBeUndefined();
  });

  it('422s on an over-long query', async () => {
    await expectStatus(h.search(ctx({ params: { id: collegeId }, body: { query: 'x'.repeat(201) } })), 422);
  });

  it('422s on an unknown category', async () => {
    await expectStatus(h.search(ctx({ params: { id: collegeId }, body: { category: 'sports' } })), 422);
  });

  it('422s on an unknown body field so a typo is never silently ignored', async () => {
    await expectStatus(h.search(ctx({ params: { id: collegeId }, body: { catagory: 'athletic' } })), 422);
  });

  it('404s for a missing college', async () => {
    await expectStatus(h.search(ctx({ params: { id: 'nope' }, body: {} })), 404);
  });
});

describe('POST /colleges/:id/scholarships/:scholarshipId/research', () => {
  async function seeded(): Promise<string> {
    await h.search(ctx({ params: { id: collegeId }, body: {} }));
    const [first] = await data.collegeScholarships.list(collegeId);
    return first!.scholarshipId;
  }

  it('starts research and returns 202 with the award', async () => {
    const scholarshipId = await seeded();
    const res = await h.research(ctx({ params: { id: collegeId, scholarshipId }, body: {} }));
    expect(res.status).toBe(202);
    expect(researchCalls).toEqual([[collegeId, scholarshipId]]);
    expect(res.body).toMatchObject({ researchStatus: 'complete' });
  });

  it('404s for an award that does not exist', async () => {
    await expectStatus(h.research(ctx({ params: { id: collegeId, scholarshipId: 'nope' }, body: {} })), 404);
  });

  it('404s for a missing college', async () => {
    await expectStatus(h.research(ctx({ params: { id: 'nope', scholarshipId: 'x' }, body: {} })), 404);
  });

  it('422s on a body with unexpected fields', async () => {
    const scholarshipId = await seeded();
    await expectStatus(h.research(ctx({ params: { id: collegeId, scholarshipId }, body: { deep: true } })), 422);
  });
});

describe('GET + DELETE /colleges/:id/scholarships/:scholarshipId', () => {
  it('returns one award, then removes it', async () => {
    await h.search(ctx({ params: { id: collegeId }, body: {} }));
    const [first] = await data.collegeScholarships.list(collegeId);
    const scholarshipId = first!.scholarshipId;

    const got = await h.detail(ctx({ params: { id: collegeId, scholarshipId } }));
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ name: 'Morrill Scholarship' });

    const removed = await h.remove(ctx({ params: { id: collegeId, scholarshipId } }));
    expect(removed.status).toBe(200);
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(0);
  });

  it('404s deleting something already gone', async () => {
    await expectStatus(h.remove(ctx({ params: { id: collegeId, scholarshipId: 'nope' } })), 404);
  });
});

describe('buildRoutes', () => {
  it('declares the five endpoints', () => {
    const sigs = buildRoutes(h)
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(sigs).toEqual(
      [
        'DELETE /colleges/:id/scholarships/:scholarshipId',
        'GET /colleges/:id/scholarships',
        'GET /colleges/:id/scholarships/:scholarshipId',
        'POST /colleges/:id/scholarships/:scholarshipId/research',
        'POST /colleges/:id/scholarships/search',
      ].sort(),
    );
  });
});

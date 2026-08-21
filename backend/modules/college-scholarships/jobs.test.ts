// Job-level tests: the reconcile rules (which are where a re-search could quietly destroy a family's
// research) and the two runners' success/failure bookkeeping. Everything runs against the in-memory
// table client with injected fake generators — no AWS, no network.

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { ScholarshipResearcher } from './research.js';
import type { FoundScholarship, ScholarshipSearcher } from './search.js';
import { coveredCategories, makeWorkerHandler, mergeFound, reconcileResults, runResearchJob, runSearchJob } from './jobs.js';

let data: Data;
let collegeId: string;

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  const college = await data.colleges.create({ name: 'Ohio State University', state: 'Ohio' });
  collegeId = college.collegeId;
});

const found = (name: string, over: Partial<FoundScholarship> = {}): FoundScholarship => ({
  name,
  category: 'academic',
  ...over,
});

const searcher = (results: FoundScholarship[]): ScholarshipSearcher => async () => results;

describe('coveredCategories', () => {
  it('lets an "all" run prune everything', () => {
    expect([...coveredCategories('all')].sort()).toEqual(['academic', 'athletic', 'other']);
  });

  it('keeps an athletic run out of the academic results', () => {
    const covered = coveredCategories('athletic');
    expect(covered.has('athletic')).toBe(true);
    expect(covered.has('academic')).toBe(false);
  });
});

describe('reconcileResults', () => {
  it('adds newly found awards', async () => {
    const total = await reconcileResults(data, collegeId, [found('Morrill'), found('Presidential')], 'all');
    expect(total).toBe(2);
    const stored = await data.collegeScholarships.list(collegeId);
    expect(stored.map((s) => s.name).sort()).toEqual(['Morrill', 'Presidential']);
  });

  it('refreshes an award we already had instead of duplicating it', async () => {
    await reconcileResults(data, collegeId, [found('Morrill', { amount: 1000 })], 'all');
    await reconcileResults(data, collegeId, [found('morrill!', { amount: 12000 })], 'all');
    const stored = await data.collegeScholarships.list(collegeId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.amount).toBe(12000);
  });

  it('never discards a dossier when the award is found again', async () => {
    await reconcileResults(data, collegeId, [found('Morrill')], 'all');
    const [stored] = await data.collegeScholarships.list(collegeId);
    await data.collegeScholarships.update(collegeId, stored!.scholarshipId, {
      research: { summary: 'hard-won research' },
      researchStatus: 'complete',
    });

    await reconcileResults(data, collegeId, [found('Morrill', { amount: 500 })], 'all');

    const [after] = await data.collegeScholarships.list(collegeId);
    expect(after?.research?.summary).toBe('hard-won research');
    expect(after?.amount).toBe(500);
  });

  it('prunes a stale, un-researched award that the new sweep did not find', async () => {
    await reconcileResults(data, collegeId, [found('Gone Award')], 'all');
    await reconcileResults(data, collegeId, [found('Still Here')], 'all');
    const stored = await data.collegeScholarships.list(collegeId);
    expect(stored.map((s) => s.name)).toEqual(['Still Here']);
  });

  it('keeps a researched award even when a later sweep misses it', async () => {
    await reconcileResults(data, collegeId, [found('Rare Award')], 'all');
    const [stored] = await data.collegeScholarships.list(collegeId);
    await data.collegeScholarships.update(collegeId, stored!.scholarshipId, {
      research: { summary: 'still valuable' },
      researchStatus: 'complete',
    });

    await reconcileResults(data, collegeId, [found('Something Else')], 'all');

    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['Rare Award', 'Something Else']);
  });

  it('keeps an award whose research is still in flight', async () => {
    await reconcileResults(data, collegeId, [found('Pending Award')], 'all');
    const [stored] = await data.collegeScholarships.list(collegeId);
    await data.collegeScholarships.update(collegeId, stored!.scholarshipId, { researchStatus: 'in-progress' });

    await reconcileResults(data, collegeId, [found('Other')], 'all');

    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['Other', 'Pending Award']);
  });

  it('an athletic sweep leaves the academic results alone', async () => {
    await reconcileResults(data, collegeId, [found('Merit Award', { category: 'academic' })], 'academic');
    await reconcileResults(data, collegeId, [found('Rowing Award', { category: 'athletic' })], 'athletic');
    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['Merit Award', 'Rowing Award']);
  });
});

describe('runSearchJob', () => {
  it('stores results and completes the search state', async () => {
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all' });
    await runSearchJob(() => data, searcher([found('A'), found('B')]), collegeId);

    const state = await data.collegeScholarshipSearch.get(collegeId);
    expect(state?.status).toBe('complete');
    expect(state?.found).toBe(2);
    expect(state?.lastRunAt).toBeTruthy();
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(2);
  });

  it('passes the requested category, sport, and the college state into the search', async () => {
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'athletic', sport: 'rowing' });
    let seen: Parameters<ScholarshipSearcher>[0] | undefined;
    await runSearchJob(
      () => data,
      async (input) => {
        seen = input;
        return [];
      },
      collegeId,
    );
    expect(seen).toMatchObject({ collegeName: 'Ohio State University', category: 'athletic', sport: 'rowing', state: 'Ohio' });
  });

  it('completes with zero found when the sweep comes back empty', async () => {
    await runSearchJob(() => data, searcher([]), collegeId);
    const state = await data.collegeScholarshipSearch.get(collegeId);
    expect(state?.status).toBe('complete');
    expect(state?.found).toBe(0);
  });

  it('records a failure instead of throwing when the generator blows up', async () => {
    await runSearchJob(
      () => data,
      async () => {
        throw new Error('bedrock exploded');
      },
      collegeId,
    );
    const state = await data.collegeScholarshipSearch.get(collegeId);
    expect(state?.status).toBe('failed');
    expect(state?.error).toContain('bedrock exploded');
  });

  it('is a no-op when the college was deleted while the job was queued', async () => {
    await data.colleges.delete(collegeId);
    await expect(runSearchJob(() => data, searcher([found('A')]), collegeId)).resolves.toBeUndefined();
    expect(await data.collegeScholarshipSearch.get(collegeId)).toBeNull();
  });
});

describe('runResearchJob', () => {
  const researcher: ScholarshipResearcher = async ({ scholarship }) => ({
    summary: `dossier for ${scholarship.name}`,
    odds: { competitiveness: 'high' },
  });

  async function seed(): Promise<string> {
    const s = await data.collegeScholarships.add(collegeId, { name: 'Morrill', category: 'academic' });
    return s.scholarshipId;
  }

  it('writes the dossier and completes', async () => {
    const id = await seed();
    await runResearchJob(() => data, researcher, collegeId, id);
    const after = await data.collegeScholarships.get(collegeId, id);
    expect(after?.researchStatus).toBe('complete');
    expect(after?.research?.summary).toBe('dossier for Morrill');
    expect(after?.researchedAt).toBeTruthy();
  });

  it('marks failed when the researcher returns nothing usable', async () => {
    const id = await seed();
    await runResearchJob(() => data, async () => null, collegeId, id);
    expect((await data.collegeScholarships.get(collegeId, id))?.researchStatus).toBe('failed');
  });

  it('marks failed rather than throwing when the researcher errors', async () => {
    const id = await seed();
    await runResearchJob(
      () => data,
      async () => {
        throw new Error('nope');
      },
      collegeId,
      id,
    );
    expect((await data.collegeScholarships.get(collegeId, id))?.researchStatus).toBe('failed');
  });

  it('is a no-op when the award is gone', async () => {
    await expect(runResearchJob(() => data, researcher, collegeId, 'missing')).resolves.toBeUndefined();
  });
});

describe('makeWorkerHandler', () => {
  it('routes a search message to the search job', async () => {
    const handler = makeWorkerHandler(() => data, { searcher: searcher([found('A')]) });
    await handler({ kind: 'search', collegeId });
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(1);
  });

  it('routes a research message to the research job', async () => {
    const s = await data.collegeScholarships.add(collegeId, { name: 'Morrill' });
    const handler = makeWorkerHandler(() => data, { researcher: async () => ({ summary: 'ok' }) });
    await handler({ kind: 'research', collegeId, scholarshipId: s.scholarshipId });
    expect((await data.collegeScholarships.get(collegeId, s.scholarshipId))?.research?.summary).toBe('ok');
  });

  it('ignores a malformed message rather than throwing', async () => {
    const handler = makeWorkerHandler(() => data, { searcher: searcher([found('A')]) });
    await expect(handler({})).resolves.toBeUndefined();
    await expect(handler({ kind: 'research', collegeId })).resolves.toBeUndefined();
    await expect(handler({ kind: 'nonsense', collegeId })).resolves.toBeUndefined();
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(0);
  });
});

describe('mergeFound', () => {
  it('flattens batches and drops a repeat the second sweep also returned', () => {
    const out = mergeFound([
      [found('Scholar-Athlete Award'), found('Merit Award')],
      [found('scholar athlete award!'), found('Rowing Award')],
    ]);
    expect(out.map((s) => s.name)).toEqual(['Scholar-Athlete Award', 'Merit Award', 'Rowing Award']);
  });

  it('handles empty batches', () => {
    expect(mergeFound([[], []])).toEqual([]);
  });
});

describe('a broad "All" sweep searches academic AND athletic', () => {
  // A single combined sweep drifted academic-only in practice, so the job runs two scoped searches
  // concurrently and merges them. This pins that.
  it('runs both scoped searches and merges the results', async () => {
    const asked: string[] = [];
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all' });
    await runSearchJob(
      () => data,
      async (input) => {
        asked.push(input.category);
        return input.category === 'athletic'
          ? [found('Rowing Award', { category: 'athletic' })]
          : [found('Merit Award', { category: 'academic' })];
      },
      collegeId,
    );
    expect(asked.sort()).toEqual(['academic', 'athletic']);
    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['Merit Award', 'Rowing Award']);
  });

  it('does NOT split when the family typed a query — their words already scope it', async () => {
    const asked: string[] = [];
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all', query: 'soccer' });
    await runSearchJob(
      () => data,
      async (input) => {
        asked.push(input.category);
        return [found('Soccer Award', { category: 'athletic' })];
      },
      collegeId,
    );
    expect(asked).toEqual(['all']);
  });

  it('passes the query through to the searcher', async () => {
    let seen: string | undefined = 'unset';
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all', query: 'soccer' });
    await runSearchJob(
      () => data,
      async (input) => {
        seen = input.query;
        return [];
      },
      collegeId,
    );
    expect(seen).toBe('soccer');
  });
});

describe('a targeted search never deletes what a broad sweep found', () => {
  // Typing "soccer" must not silently wipe out the merit awards already on the college.
  it('adds to the list instead of replacing it', async () => {
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all' });
    await runSearchJob(() => data, searcher([found('Merit Award'), found('Provost Award')]), collegeId);
    expect(await data.collegeScholarships.list(collegeId)).toHaveLength(2);

    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all', query: 'soccer' });
    await runSearchJob(() => data, searcher([found('Soccer Award', { category: 'athletic' })]), collegeId);

    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['Merit Award', 'Provost Award', 'Soccer Award']);
  });

  it('but a broad sweep still prunes what it no longer finds', async () => {
    await data.collegeScholarshipSearch.patch(collegeId, { status: 'in-progress', category: 'all' });
    await runSearchJob(() => data, searcher([found('Gone Award')]), collegeId);
    await runSearchJob(() => data, searcher([found('Still Here')]), collegeId);
    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name);
    expect(names).toEqual(['Still Here']);
  });
});

describe('reconcileResults prune flag', () => {
  it('leaves everything alone when pruning is off', async () => {
    await reconcileResults(data, collegeId, [found('A'), found('B')], 'all');
    await reconcileResults(data, collegeId, [found('C')], 'all', false);
    const names = (await data.collegeScholarships.list(collegeId)).map((s) => s.name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });
});

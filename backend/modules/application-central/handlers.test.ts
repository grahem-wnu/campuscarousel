import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type AppCentralHandlers } from './handlers.js';
import type { EssayReviewer, ExperienceFinder } from './ai.js';
import type { ExperiencePool } from './grounding.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: AppCentralHandlers;
let finderPools: ExperiencePool[];

const stubFinder: ExperienceFinder = async ({ pool }) => {
  finderPools.push(pool);
  return { suggestedExperiences: [{ title: 'County Hospital', kind: 'experience', why: 'vivid' }], angles: ['open with a scene'], source: 'curated' };
};
const stubReviewer: EssayReviewer = async ({ content }) => ({
  strengths: ['clear'], improvements: ['tighten'], authenticity: 'you', wordCount: content.split(/\s+/).length, onTarget: null, rewrote: false, source: 'curated',
});

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  finderPools = [];
  h = makeHandlers({ getData: () => data, now, finder: stubFinder, reviewer: stubReviewer });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: keira, params: {}, query: {}, body: undefined, ...over });
const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function createEssay(body: Record<string, unknown> = {}) {
  const res = await h.createEssay(ctx({ body: { collegeId: 'osu', prompt: 'Why nursing?', ...body } }));
  return (res.body as { essayId: string }).essayId;
}
async function seedPrivate() {
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Family', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
}

describe('essay CRUD + drafts', () => {
  it('creates / lists / filters / 404 / 422', async () => {
    await createEssay();
    await createEssay({ collegeId: 'iu', status: 'final' });
    expect((((await h.listEssays(ctx())).body) as { essays: unknown[] }).essays).toHaveLength(2);
    expect((((await h.listEssays(ctx({ query: { collegeId: 'iu' } }))).body) as { essays: unknown[] }).essays).toHaveLength(1);
    expect((((await h.listEssays(ctx({ query: { status: 'final' } }))).body) as { essays: unknown[] }).essays).toHaveLength(1);
    await expectStatus(h.detailEssay(ctx({ params: { id: 'ghost' } })), 404);
    await expectStatus(h.createEssay(ctx({ body: { bogus: 1 } })), 422);
  });

  it('appends drafts with computed version + wordCount and advances status', async () => {
    const id = await createEssay();
    const r1 = await h.addDraft(ctx({ params: { id }, body: { content: 'one two three' } }));
    expect(r1.status).toBe(201);
    type EssayBody = { drafts: { version: number; wordCount?: number }[]; status: string };
    const essay = r1.body as EssayBody;
    expect(essay.drafts).toHaveLength(1);
    expect(essay.drafts[0]).toMatchObject({ version: 1, wordCount: 3 });
    expect(essay.status).toBe('drafting');
    const r2 = await h.addDraft(ctx({ params: { id }, body: { content: 'a b' } }));
    expect((r2.body as EssayBody).drafts.map((d) => d.version)).toEqual([1, 2]);
  });
});

describe('find-experiences — PRIVACY', () => {
  it('grounds with private entries for keira but NOT for a parent', async () => {
    await seedPrivate();
    const id = await createEssay();
    await h.findExperiences(ctx({ params: { id }, body: {} }));
    expect(finderPools.at(-1)?.includesPrivate).toBe(true);
    await h.findExperiences(ctx({ requester: kate, params: { id }, body: {} }));
    expect(finderPools.at(-1)?.includesPrivate).toBe(false);
  });

  it('returns the finder result + counts (live, not persisted)', async () => {
    const id = await createEssay();
    const res = await h.findExperiences(ctx({ params: { id }, body: { prompt: 'override' } }));
    expect((res.body as { result: { angles: string[] } }).result.angles).toEqual(['open with a scene']);
    // not persisted onto the essay
    const essay = await data.essays.get(id);
    expect(essay?.aiSuggestedAngles).toBeUndefined();
  });
});

describe('review — async job, never rewrites', () => {
  it('starts an evaluation job (202) that completes inline and never returns a rewrite', async () => {
    const id = await createEssay();
    const res = await h.startReview(ctx({ params: { id }, body: { content: 'My essay draft about nursing.' } }));
    expect(res.status).toBe(202);
    const job = res.body as { jobId: string; status: string; result?: { rewrote: boolean } };
    expect(job.status).toBe('complete');
    expect(job.result?.rewrote).toBe(false);
    // status endpoint returns the same job
    const poll = await h.reviewStatus(ctx({ params: { jobId: job.jobId } }));
    expect((poll.body as { jobId: string }).jobId).toBe(job.jobId);
  });

  it('404s startReview for an unknown essay; 404s reviewStatus for an unknown job', async () => {
    await expectStatus(h.startReview(ctx({ params: { id: 'ghost' }, body: { content: 'x' } })), 404);
    await expectStatus(h.reviewStatus(ctx({ params: { jobId: 'ghost' } })), 404);
  });
});

describe('applications overview (derived)', () => {
  it('builds rows from colleges + essays + teas', async () => {
    await data.colleges.create({ name: 'Ohio State', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01' } } as Parameters<Data['colleges']['create']>[0]);
    const col = await data.colleges.list();
    await createEssay({ collegeId: col[0]!.collegeId, status: 'final' });
    const res = await h.overview(ctx());
    const apps = (res.body as { applications: { name: string; essays: { final: number } }[] }).applications;
    expect(apps[0]?.name).toBe('Ohio State');
    expect(apps[0]?.essays.final).toBe(1);
  });
});

describe('essay coach — college grounding, rated review, practice questions', () => {
  async function seedCollege() {
    const college = await data.colleges.create({
      name: 'Ohio State',
      essayPrompts: ['Why OSU nursing?'],
      admissionsDeepDive: 'Holistic direct admit.',
    } as Parameters<Data['colleges']['create']>[0]);
    return college.collegeId;
  }

  it('passes the linked college to the finder and practice generator', async () => {
    const collegeId = await seedCollege();
    const seen: Array<string | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      finder: async ({ college, pool }) => { seen.push(college?.name); return stubFinder({ prompt: '', pool }); },
      practice: async ({ college }) => { seen.push(college?.name); return { questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const }; },
    });
    const linked = (await localH.createEssay(ctx({ body: { collegeId, prompt: 'p' } }))).body as { essayId: string };
    await localH.findExperiences(ctx({ params: { id: linked.essayId }, body: {} }));
    const pq = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId } }));
    expect(pq.status).toBe(202);
    expect(seen).toEqual(['Ohio State', 'Ohio State']);
    expect((pq.body as { result?: { collegeName?: string } }).result?.collegeName).toBe('Ohio State');

    const pq2 = await localH.practiceQuestionsForCollege(ctx({ body: {} }));
    expect(seen.at(-1)).toBeUndefined();
    expect((pq2.body as { result?: { collegeName?: string } }).result?.collegeName).toBeUndefined();
  });

  it('persists a compact lastReview from an AI rubric review (via the async job)', async () => {
    const localH = makeHandlers({
      getData: () => data,
      now,
      reviewer: async ({ content }) => ({
        strengths: ['s'], improvements: ['i'], authenticity: 'a',
        ratings: { promptFit: 8, voice: 9, structure: 7, specificity: 8 },
        overall: 8, verdict: 'close' as const,
        wordCount: content.split(/\s+/).length, onTarget: null, rewrote: false as const, source: 'ai' as const,
      }),
    });
    const id = ((await localH.createEssay(ctx({ body: { prompt: 'p' } }))).body as { essayId: string }).essayId;
    const res = await localH.startReview(ctx({ params: { id }, body: { content: 'my draft words' } }));
    expect(res.status).toBe(202);
    const job = res.body as { status: string; result?: { overall?: number } };
    expect(job.status).toBe('complete');
    expect(job.result?.overall).toBe(8);
    const stored = await data.essays.get(id);
    expect(stored?.lastReview).toMatchObject({ overall: 8, verdict: 'close', reviewedAt: now().toISOString() });
  });

  it('does NOT persist lastReview from the curated fallback (no fake scores)', async () => {
    const id = await createEssay();
    await h.startReview(ctx({ params: { id }, body: { content: 'my draft words' } }));
    expect((await data.essays.get(id))?.lastReview).toBeUndefined();
  });

  it('records no draft version on the persisted lastReview', async () => {
    const localH = makeHandlers({
      getData: () => data,
      now,
      reviewer: async () => ({
        strengths: ['s'], improvements: [], authenticity: '',
        overall: 6, verdict: 'keep-working' as const,
        wordCount: 2, onTarget: null, rewrote: false as const, source: 'ai' as const,
      }),
    });
    const id = ((await localH.createEssay(ctx({ body: { prompt: 'p' } }))).body as { essayId: string }).essayId;
    await localH.startReview(ctx({ params: { id }, body: { content: 'unsaved text' } }));
    const lastReview = (await data.essays.get(id))?.lastReview;
    expect(lastReview).toBeDefined();
    expect(lastReview?.version).toBeUndefined();
  });
});

describe('practice-questions (async job)', () => {
  it('creates a job, runs it inline (no queue), returns 202 with the complete result', async () => {
    const localH = makeHandlers({
      getData: () => data, now,
      practice: async ({ college }) => ({ questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const }),
    });
    const college = await data.colleges.create({ name: 'Ohio State', status: 'applying', essayPrompts: ['Why OSU?'] } as Parameters<Data['colleges']['create']>[0]);
    const res = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId: college.collegeId } }));
    expect(res.status).toBe(202);
    const job = res.body as { jobId: string; status: string; result?: { usedRealPrompts: boolean; collegeName?: string } };
    expect(job.status).toBe('complete');
    expect(job.result?.usedRealPrompts).toBe(true);
    expect(job.result?.collegeName).toBe('Ohio State');

    // status endpoint returns the same job
    const poll = await localH.practiceQuestionsStatus(ctx({ params: { jobId: job.jobId } }));
    expect((poll.body as { jobId: string }).jobId).toBe(job.jobId);
  });

  it('typed name → usedRealPrompts false; unknown jobId → 404; strict-schema 422', async () => {
    const localH = makeHandlers({ getData: () => data, now, practice: async () => ({ questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'ai' as const }) });
    const typed = await localH.practiceQuestionsForCollege(ctx({ body: { collegeName: 'Imaginary U' } }));
    expect((typed.body as { result?: { usedRealPrompts: boolean } }).result?.usedRealPrompts).toBe(false);
    await expectStatus(localH.practiceQuestionsStatus(ctx({ params: { jobId: 'ghost' } })), 404);
    await expectStatus(localH.practiceQuestionsForCollege(ctx({ body: { bogus: 1 } })), 422);
  });
});

describe('per-essay word target', () => {
  it('parses a stated count from the prompt at creation; silent prompts get none', async () => {
    const res = await h.createEssay(ctx({ body: { prompt: 'Why us? In 350 words or fewer.' } }));
    expect((res.body as { targetWords?: number }).targetWords).toBe(350);
    const silent = await h.createEssay(ctx({ body: { prompt: 'Why nursing?' } }));
    expect((silent.body as { targetWords?: number }).targetWords).toBeUndefined();
    const explicit = await h.createEssay(ctx({ body: { prompt: 'In 350 words.', targetWords: 500 } }));
    expect((explicit.body as { targetWords?: number }).targetWords).toBe(500);
  });

  it('review falls back to the essay target when the body sends none', async () => {
    const seen: Array<number | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      reviewer: async ({ content, targetWords }) => {
        seen.push(targetWords);
        return stubReviewer({ prompt: '', content });
      },
    });
    const id = ((await localH.createEssay(ctx({ body: { prompt: 'A 300-word response.' } }))).body as { essayId: string }).essayId;
    await localH.startReview(ctx({ params: { id }, body: { content: 'my draft' } }));
    await localH.startReview(ctx({ params: { id }, body: { content: 'my draft', targetWords: 650 } }));
    expect(seen).toEqual([300, 650]);
  });
});

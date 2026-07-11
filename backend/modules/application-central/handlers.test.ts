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

describe('review — never rewrites', () => {
  it('reviews the latest draft and never returns a rewrite', async () => {
    const id = await createEssay();
    await h.addDraft(ctx({ params: { id }, body: { content: 'My essay draft about nursing.' } }));
    const res = await h.review(ctx({ params: { id }, body: {} }));
    expect((res.body as { review: { rewrote: boolean } }).review.rewrote).toBe(false);
  });

  it('422s when there is no content to review', async () => {
    const id = await createEssay();
    await expectStatus(h.review(ctx({ params: { id }, body: {} })), 422);
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
    expect(seen).toEqual(['Ohio State', 'Ohio State']);
    expect((pq.body as { collegeName?: string }).collegeName).toBe('Ohio State');

    const pq2 = await localH.practiceQuestionsForCollege(ctx({ body: {} }));
    expect(seen.at(-1)).toBeUndefined();
    expect((pq2.body as { collegeName?: string }).collegeName).toBeUndefined();
  });

  it('persists a compact lastReview from an AI rubric review (with the reviewed draft version)', async () => {
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
    await localH.addDraft(ctx({ params: { id }, body: { content: 'my draft words' } }));
    const res = await localH.review(ctx({ params: { id }, body: {} }));
    const body = res.body as { review: { overall?: number }; essay: { lastReview?: { overall: number; verdict: string; version?: number; reviewedAt: string } } };
    expect(body.review.overall).toBe(8);
    expect(body.essay.lastReview).toMatchObject({ overall: 8, verdict: 'close', version: 1, reviewedAt: now().toISOString() });
    const stored = await data.essays.get(id);
    expect(stored?.lastReview?.overall).toBe(8);
  });

  it('does NOT persist lastReview from the curated fallback (no fake scores)', async () => {
    const id = await createEssay();
    await h.addDraft(ctx({ params: { id }, body: { content: 'my draft words' } }));
    await h.review(ctx({ params: { id }, body: {} }));
    expect((await data.essays.get(id))?.lastReview).toBeUndefined();
  });

  it('ad-hoc content review records no draft version', async () => {
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
    const res = await localH.review(ctx({ params: { id }, body: { content: 'unsaved text' } }));
    const lastReview = (res.body as { essay: { lastReview?: { version?: number } } }).essay.lastReview;
    expect(lastReview).toBeDefined();
    expect(lastReview?.version).toBeUndefined();
  });
});

describe('practice-questions (questions-first, collegeId-keyed)', () => {
  it('grounds on a roster college and flags usedRealPrompts when it has real prompts', async () => {
    const seen: Array<string | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      practice: async ({ college }) => {
        seen.push(college?.name);
        return { questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const };
      },
    });
    const college = await data.colleges.create({
      name: 'Ohio State', status: 'applying', essayPrompts: ['Why nursing at OSU?'],
    } as Parameters<Data['colleges']['create']>[0]);
    const res = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId: college.collegeId } }));
    const body = res.body as { collegeName?: string; usedRealPrompts: boolean; questions: unknown[] };
    expect(seen).toEqual(['Ohio State']);
    expect(body.collegeName).toBe('Ohio State');
    expect(body.usedRealPrompts).toBe(true);
    expect(body.questions).toHaveLength(1);
  });

  it('uses a typed school name with usedRealPrompts=false, and works with no school', async () => {
    const seen: Array<string | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      practice: async ({ college }) => {
        seen.push(college?.name);
        return { questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'ai' as const };
      },
    });
    const typed = await localH.practiceQuestionsForCollege(ctx({ body: { collegeName: 'Imaginary U' } }));
    expect((typed.body as { collegeName?: string; usedRealPrompts: boolean }).collegeName).toBe('Imaginary U');
    expect((typed.body as { usedRealPrompts: boolean }).usedRealPrompts).toBe(false);
    const general = await localH.practiceQuestionsForCollege(ctx({ body: {} }));
    expect((general.body as { usedRealPrompts: boolean }).usedRealPrompts).toBe(false);
    expect(seen).toEqual(['Imaginary U', undefined]);
  });

  it('flags usedRealPrompts=false for a roster college that has no essayPrompts', async () => {
    const localH = makeHandlers({
      getData: () => data,
      now,
      practice: async () => ({ questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const }),
    });
    const college = await data.colleges.create({
      name: 'No Prompts U', status: 'applying',
    } as Parameters<Data['colleges']['create']>[0]);
    const res = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId: college.collegeId } }));
    const body = res.body as { collegeName?: string; usedRealPrompts: boolean };
    expect(body.collegeName).toBe('No Prompts U');
    expect(body.usedRealPrompts).toBe(false);
  });

  it('422s on an unknown body field (strict schema)', async () => {
    await expectStatus(h.practiceQuestionsForCollege(ctx({ body: { bogus: 1 } })), 422);
  });

  it('422s on a whitespace-only collegeName (trim + min(1))', async () => {
    await expectStatus(h.practiceQuestionsForCollege(ctx({ body: { collegeName: '   ' } })), 422);
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
    await localH.addDraft(ctx({ params: { id }, body: { content: 'my draft' } }));
    await localH.review(ctx({ params: { id }, body: {} }));
    await localH.review(ctx({ params: { id }, body: { targetWords: 650 } }));
    expect(seen).toEqual([300, 650]);
  });
});

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
  return { suggestedExperiences: [{ title: 'County Hospital', kind: 'clinical', why: 'vivid' }], angles: ['open with a scene'], source: 'curated' };
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

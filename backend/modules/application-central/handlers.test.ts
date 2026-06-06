import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data, type Essay } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type EssayHandlers } from './handlers.js';
import type { EssayReviewer, ExperienceFinder, FindInput } from './ai.js';
import type { ExperienceCandidate } from './experiences.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
let h: EssayHandlers;
let lastFindInput: FindInput | null;

// Fake finder records what it was given (so we can assert the privacy-narrowed candidate set) and
// echoes the candidates back as "selected".
const finder: ExperienceFinder = (input) => {
  lastFindInput = input;
  return Promise.resolve({
    experiences: input.candidates.map((c) => ({ source: c.source, id: c.id, title: c.title, why: 'relevant' })),
    angles: ['angle one'],
  });
};
const reviewer: EssayReviewer = () =>
  Promise.resolve({ strengths: ['clear voice'], suggestions: ['tighten the intro'], authenticity: 'genuine', structure: 'solid' });

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => finder, () => reviewer);
  lastFindInput = null;
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: keira, params: {}, query: {}, body: undefined, ...over });
const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seedEssay(over: Record<string, unknown> = {}): Promise<string> {
  const e = await data.essays.create({ prompt: 'Why nursing?', status: 'drafting', createdBy: 'keira', ...over } as Parameters<Data['essays']['create']>[0]);
  return e.essayId;
}

describe('create / list / detail (POST,GET /essays)', () => {
  it('creates with createdBy from the JWT and an optional first draft', async () => {
    const res = await h.create(ctx({ body: { prompt: 'Tell us about you', draftContent: 'My first draft words' } }));
    expect(res.status).toBe(201);
    const essay = res.body as Essay;
    expect(essay.createdBy).toBe('keira');
    expect(essay.status).toBe('brainstorming');
    expect(essay.drafts?.[0]).toMatchObject({ version: 1, wordCount: 4 });
  });

  it('filters list by collegeId and status', async () => {
    await seedEssay({ collegeId: 'osu', status: 'drafting' });
    await seedEssay({ collegeId: 'um', status: 'final' });
    expect(((await h.list(ctx({ query: { collegeId: 'osu' } }))).body as { essays: Essay[] }).essays).toHaveLength(1);
    expect(((await h.list(ctx({ query: { status: 'final' } }))).body as { essays: Essay[] }).essays).toHaveLength(1);
  });

  it('detail 404 when missing', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('422 on unknown create field', async () => {
    await expectStatus(h.create(ctx({ body: { bogus: 1 } })), 422);
  });
});

describe('update (PUT /essays/:id) — drafts + fields', () => {
  it('appends a new draft version with computed wordCount', async () => {
    const id = await seedEssay();
    await h.update(ctx({ params: { id }, body: { addDraftContent: 'one two three' } }));
    const res = await h.update(ctx({ params: { id }, body: { addDraftContent: 'four five', status: 'reviewing' } }));
    const essay = res.body as Essay;
    expect(essay.drafts).toHaveLength(2);
    expect(essay.drafts?.[1]).toMatchObject({ version: 2, wordCount: 2 });
    expect(essay.status).toBe('reviewing');
  });

  it('404 when missing', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { notes: 'x' } })), 404);
  });
});

describe('find-experiences (POST /essays/:id/find-experiences) — PRIVACY', () => {
  beforeEach(async () => {
    await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Family activity', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
    await data.whyNursing.create({ date: '2026-02-01', title: 'Private reflection', content: 'secret spark', visibility: 'private' } as Parameters<Data['whyNursing']['create']>[0]);
    await data.clinical.create({ date: '2026-03-01', facility: 'Mercy', hours: 4, visibility: 'private' } as Parameters<Data['clinical']['create']>[0]);
  });

  it('includes Keira’s PRIVATE entries in the AI candidate set when Keira is the caller', async () => {
    const id = await seedEssay();
    const res = await h.findExperiences(ctx({ requester: keira, params: { id } }));
    const titles = (lastFindInput?.candidates ?? []).map((c: ExperienceCandidate) => c.title);
    expect(titles).toContain('Private reflection'); // private why-nursing reached the AI
    expect(lastFindInput?.candidates.some((c) => c.visibility === 'private')).toBe(true);
    // persisted picks on the essay
    expect((res.body as { essay: Essay }).essay.aiSuggestedActivities?.length).toBeGreaterThan(0);
  });

  it('EXCLUDES private entries from the AI candidate set for a parent', async () => {
    const id = await seedEssay();
    const res = await h.findExperiences(ctx({ requester: kate, params: { id } }));
    const cands = lastFindInput?.candidates ?? [];
    expect(cands.every((c) => c.visibility !== 'private')).toBe(true);
    expect(cands.map((c) => c.title)).not.toContain('Private reflection');
    // and the parent-visible response surfaces no private content
    const exp = (res.body as { experiences: { title: string }[] }).experiences;
    expect(exp.map((e) => e.title)).not.toContain('Private reflection');
  });

  it('EXCLUDES private entries for an admin too', async () => {
    const id = await seedEssay();
    await h.findExperiences(ctx({ requester: grahem, params: { id } }));
    expect((lastFindInput?.candidates ?? []).every((c) => c.visibility !== 'private')).toBe(true);
  });

  it('404 when the essay is missing', async () => {
    await expectStatus(h.findExperiences(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('review (POST /essays/:id/review)', () => {
  it('reviews the latest draft and returns feedback (no rewrite field)', async () => {
    const id = await seedEssay();
    await h.update(ctx({ params: { id }, body: { addDraftContent: 'a draft to review' } }));
    const res = await h.review(ctx({ params: { id } }));
    const fb = (res.body as { feedback: Record<string, unknown> }).feedback;
    expect(fb).toMatchObject({ strengths: expect.any(Array), suggestions: expect.any(Array) });
    expect(fb).not.toHaveProperty('rewrite');
    expect(fb).not.toHaveProperty('rewritten');
  });

  it('422 when there is no draft and no content provided', async () => {
    const id = await seedEssay();
    await expectStatus(h.review(ctx({ params: { id } })), 422);
  });

  it('reviews explicit content when provided', async () => {
    const id = await seedEssay();
    const res = await h.review(ctx({ params: { id }, body: { content: 'inline content' } }));
    expect((res.body as { feedback: unknown }).feedback).toBeDefined();
  });

  it('404 when missing', async () => {
    await expectStatus(h.review(ctx({ params: { id: 'ghost' } })), 404);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type InterviewHandlers } from './handlers.js';
import type { FeedbackGenerator, QuestionGenerator } from './ai.js';
import type { GroundingContext } from './grounding.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: InterviewHandlers;
let feedbackGrounding: GroundingContext[]; // captures what grounding the feedback gen received

const stubQuestionGen: QuestionGenerator = async ({ count }) =>
  Array.from({ length: count }, (_, i) => ({ question: `Q${i + 1}?`, category: 'general' as const }));
const stubFeedbackGen: FeedbackGenerator = async ({ grounding }) => {
  feedbackGrounding.push(grounding);
  return { strengths: ['s'], improvements: ['i'], suggestions: ['x'], rating: 4, references: [], source: 'curated' };
};

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  feedbackGrounding = [];
  h = makeHandlers({ getData: () => data, now, questionGen: stubQuestionGen, feedbackGen: stubFeedbackGen });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: keira, params: {}, query: {}, body: undefined, ...over });
const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seedPrivateAndFamily() {
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Family act', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private act', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
}

describe('CRUD', () => {
  it('creates / lists / filters / 404s', async () => {
    const created = await h.create(ctx({ body: { type: 'real-interview', date: '2026-05-01', collegeId: 'c1', overallNotes: 'went well' } }));
    expect(created.status).toBe(201);
    await h.create(ctx({ body: { type: 'mock-practice', date: '2026-05-02' } }));
    const all = await h.list(ctx());
    expect((all.body as { interviews: unknown[] }).interviews).toHaveLength(2);
    const reals = await h.list(ctx({ query: { type: 'real-interview' } }));
    expect((reals.body as { interviews: unknown[] }).interviews).toHaveLength(1);
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
    await expectStatus(h.create(ctx({ body: { type: 'bad', date: '2026-05-01' } })), 422);
  });

  it('owner-gates update/delete; the PUT response is scrubbed; the owner can edit', async () => {
    await seedPrivateAndFamily();
    const mock = await h.mock(ctx({ body: { count: 1 } })); // created by keira
    const sessionId = (mock.body as { session: { sessionId: string } }).session.sessionId;
    await h.answer(ctx({ params: { sessionId }, body: { questionIndex: 0, answer: 'private-grounded answer' } }));

    // a parent cannot PUT or DELETE keira's session (no cross-user mutation / no leak via PUT)
    await expectStatus(h.update(ctx({ requester: kate, params: { id: sessionId }, body: { confidenceLevel: 5 } })), 403);
    await expectStatus(h.remove(ctx({ requester: kate, params: { id: sessionId } })), 403);

    // the owner can edit, and even the owner's PUT response carries her own fields (scrub is a no-op)
    const ok = await h.update(ctx({ params: { id: sessionId }, body: { confidenceLevel: 4 } }));
    expect((ok.body as { confidenceLevel: number; questions: { answer?: string }[] }).confidenceLevel).toBe(4);
    expect((ok.body as { questions: { answer?: string }[] }).questions[0]?.answer).toBe('private-grounded answer');
  });
});

describe('mock', () => {
  it('creates a mock-practice session with generated questions (today, pinned clock)', async () => {
    const res = await h.mock(ctx({ body: { school: 'Ohio State', count: 3 } }));
    expect(res.status).toBe(201);
    const session = (res.body as { session: { type: string; date: string; questions: { question: string }[] } }).session;
    expect(session.type).toBe('mock-practice');
    expect(session.date).toBe('2026-06-06');
    expect(session.questions.map((q) => q.question)).toEqual(['Q1?', 'Q2?', 'Q3?']);
  });
});

describe('answer — feedback + PRIVACY', () => {
  it('scores an answer, stores feedback, and 404s a bad index', async () => {
    await seedPrivateAndFamily();
    const mock = await h.mock(ctx({ body: { count: 2 } }));
    const sessionId = (mock.body as { session: { sessionId: string } }).session.sessionId;

    const res = await h.answer(ctx({ params: { sessionId }, body: { questionIndex: 0, answer: 'A thoughtful, detailed answer.' } }));
    expect(res.status).toBe(200);
    expect((res.body as { feedback: { rating: number } }).feedback.rating).toBe(4);
    const stored = await data.interviews.get(sessionId);
    expect(stored?.questions?.[0]?.answer).toBe('A thoughtful, detailed answer.');
    expect(stored?.questions?.[0]?.rating).toBe(4);

    await expectStatus(h.answer(ctx({ params: { sessionId }, body: { questionIndex: 9, answer: 'x' } })), 404);
  });

  it('READ PATH: a parent never receives keira’s private-derived feedback/answer; keira does', async () => {
    await seedPrivateAndFamily();
    const mock = await h.mock(ctx({ body: { count: 1 } })); // created by keira
    const sessionId = (mock.body as { session: { sessionId: string } }).session.sessionId;
    await h.answer(ctx({ params: { sessionId }, body: { questionIndex: 0, answer: 'grounded in my private reflection' } }));

    // keira (owner) sees the answer + feedback
    const asKeira = (await h.detail(ctx({ params: { id: sessionId } }))).body as { questions: { answer?: string; aiFeedback?: string }[] };
    expect(asKeira.questions[0]?.answer).toBe('grounded in my private reflection');
    expect(asKeira.questions[0]?.aiFeedback).toBeTruthy();

    // a parent gets the session metadata but the private-derived fields are scrubbed
    const asKate = (await h.detail(ctx({ requester: kate, params: { id: sessionId } }))).body as { type: string; questions: { answer?: string; aiFeedback?: string }[] };
    expect(asKate.type).toBe('mock-practice'); // metadata still visible
    expect(asKate.questions[0]?.answer).toBeUndefined();
    expect(asKate.questions[0]?.aiFeedback).toBeUndefined();

    // …and via list too
    const kateList = (await h.list(ctx({ requester: kate }))).body as { interviews: { questions?: { aiFeedback?: string }[] }[] };
    expect(kateList.interviews[0]?.questions?.[0]?.aiFeedback).toBeUndefined();

    // a parent cannot answer keira's mock (no grounding/overwrite, no private flow-back)
    await expectStatus(h.answer(ctx({ requester: kate, params: { sessionId }, body: { questionIndex: 0, answer: 'x' } })), 403);
  });

  it('grounds feedback with private entries for keira but NOT for a parent', async () => {
    await seedPrivateAndFamily();
    const mockK = await h.mock(ctx({ body: { count: 1 } }));
    const sidK = (mockK.body as { session: { sessionId: string } }).session.sessionId;
    await h.answer(ctx({ params: { sessionId: sidK }, body: { questionIndex: 0, answer: 'keira answer' } }));
    expect(feedbackGrounding.at(-1)?.includesPrivate).toBe(true);

    const mockP = await h.mock(ctx({ requester: kate, body: { count: 1 } }));
    const sidP = (mockP.body as { session: { sessionId: string } }).session.sessionId;
    await h.answer(ctx({ requester: kate, params: { sessionId: sidP }, body: { questionIndex: 0, answer: 'parent answer' } }));
    expect(feedbackGrounding.at(-1)?.includesPrivate).toBe(false);
  });
});

describe('question bank', () => {
  it('returns the curated bank, filters by category/search', async () => {
    const all = await h.listQuestions(ctx());
    expect((all.body as { questions: unknown[] }).questions.length).toBeGreaterThan(5);
    const ethics = await h.listQuestions(ctx({ query: { category: 'ethics' } }));
    expect((ethics.body as { questions: { category: string }[] }).questions.every((q) => q.category === 'ethics')).toBe(true);
  });

  it('adds a custom question (persisted) and surfaces it on the next list', async () => {
    await data.profiles.put({ userId: 'keira', name: 'Keira', role: 'student' });
    const added = await h.addQuestion(ctx({ body: { question: 'My custom question?', category: 'behavioral', starred: true } }));
    expect(added.status).toBe(201);
    const list = await h.listQuestions(ctx({ query: { search: 'custom question' } }));
    expect((list.body as { questions: { question: string }[] }).questions.map((q) => q.question)).toContain('My custom question?');
  });

  it('422s an empty custom question', async () => {
    await expectStatus(h.addQuestion(ctx({ body: { question: '' } })), 422);
  });

  it("includes the student's major-pack questions (nursing → 'Why do you want to become a nurse?')", async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    const list = await h.listQuestions(ctx());
    const questions = (list.body as { questions: { question: string }[] }).questions.map((q) => q.question);
    expect(questions).toContain('Why do you want to become a nurse?');
  });
});

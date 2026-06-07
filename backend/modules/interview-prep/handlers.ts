// Interview Prep handlers. Session records are family-visible; identity comes from the JWT and the
// router 401s unauthenticated callers. The AI feedback path is PRIVACY-CRITICAL: it grounds in
// activities/clinical/why-nursing via gatherGrounding(), which filters with aiVisibleSet off the JWT
// so private entries are surfaced only when keira (student) is the caller. Built from injectable deps
// so tests supply an in-memory data client, a pinned clock, and stub AI generators.

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data, Interview } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import {
  addQuestionSchema,
  answerSchema,
  createSchema,
  idParamSchema,
  listQuerySchema,
  mockStartSchema,
  questionQuerySchema,
  sessionParamSchema,
  updateSchema,
} from './schema.js';
import { QUESTION_BANK, filterBank, type BankQuestion } from './questionbank.js';
import { gatherGrounding } from './grounding.js';
import {
  makeBedrockFeedbackGenerator,
  makeBedrockQuestionGenerator,
  type AnswerFeedback,
  type FeedbackGenerator,
  type QuestionGenerator,
} from './ai.js';

const DEFAULT_QUESTION_COUNT = 6;

export interface InterviewHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  mock: Handler;
  answer: Handler;
  listQuestions: Handler;
  addQuestion: Handler;
}

export interface InterviewDeps {
  getData: () => Data;
  questionGen?: QuestionGenerator;
  feedbackGen?: FeedbackGenerator;
  now?: () => Date;
}

/** Render structured feedback into the single `aiFeedback` string the Interview type stores. */
function renderFeedback(f: AnswerFeedback): string {
  const parts = [
    `Rating: ${f.rating}/5`,
    f.strengths.length ? `Strengths: ${f.strengths.join(' ')}` : '',
    f.improvements.length ? `Improve: ${f.improvements.join(' ')}` : '',
    f.suggestions.length ? `Suggestions: ${f.suggestions.join(' ')}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

async function loadCustomQuestions(data: Data, username: string): Promise<BankQuestion[]> {
  const profile = await data.profiles.get(username);
  const list = profile?.preferences?.['interviewQuestions'];
  return Array.isArray(list) ? (list as BankQuestion[]) : [];
}

/**
 * PRIVACY (read path): a `mock-practice` session's per-question `aiFeedback`/`answer` are derived from
 * the AI grounding, which includes keira's PRIVATE entries when she is the caller — so that content
 * must never reach another caller through the family-readable session. Strip those fields unless the
 * caller is the session's owner (`Interview.createdBy`, the foundational field stamped at create).
 * Session metadata + the question text stay family-visible (spec); `real-interview` logs carry no
 * AI-grounded content and are untouched.
 */
function scrubForReader(session: Interview, username: string): Interview {
  if (session.type !== 'mock-practice') return session;
  if (session.createdBy === username) return session;
  return {
    ...session,
    questions: (session.questions ?? []).map((q) => ({ ...q, answer: undefined, aiFeedback: undefined })),
  };
}

export function makeHandlers(deps: InterviewDeps): InterviewHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const questionGen = deps.questionGen ?? makeBedrockQuestionGenerator();
  const feedbackGen = deps.feedbackGen ?? makeBedrockFeedbackGenerator();
  const today = (): string => now().toISOString().slice(0, 10);

  async function requireSession(id: string): Promise<Interview> {
    const s = await getData().interviews.get(id);
    if (!s) throw Errors.notFound('Interview session not found');
    return s;
  }

  return {
    // GET /interviews — list (optionally by type); private-derived mock fields scrubbed for non-owners.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items = await getData().interviews.list();
      if (q.type) items = items.filter((i) => i.type === q.type);
      return { status: 200, body: { interviews: items.map((s) => scrubForReader(s, ctx.requester.username)) } };
    },

    // GET /interviews/:id — private-derived mock fields scrubbed for non-owners.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const session = await requireSession(id);
      return { status: 200, body: scrubForReader(session, ctx.requester.username) };
    },

    // POST /interviews — create a session (e.g. a real-interview log). Stamp the owner.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().interviews.create({
        ...input,
        createdBy: ctx.requester.username,
      } as Parameters<Data['interviews']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /interviews/:id — owner-only (a session can carry private-derived feedback); the response
    // is also scrubbed defensively so no private-derived field can return via this path.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const session = await requireSession(id);
      if (session.createdBy !== ctx.requester.username) {
        throw Errors.forbidden('Only the owner can edit this interview session');
      }
      const updated = await getData().interviews.update(id, patch);
      return { status: 200, body: scrubForReader(updated, ctx.requester.username) };
    },

    // DELETE /interviews/:id — owner-only (no cross-user deletion of someone's sessions).
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const session = await requireSession(id);
      if (session.createdBy !== ctx.requester.username) {
        throw Errors.forbidden('Only the owner can delete this interview session');
      }
      await getData().interviews.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /interviews/mock — start an AI mock: generate questions grounded in her experiences,
    // persist a mock-practice session with the questions (answers to be filled in via /answer).
    mock: async (ctx) => {
      const body = validateBody(mockStartSchema, ctx);
      const data = getData();
      const grounding = await gatherGrounding(data, ctx.requester);
      const generated = await questionGen({
        school: body.school,
        count: body.count ?? DEFAULT_QUESTION_COUNT,
        grounding,
      });
      const session = await data.interviews.create({
        type: 'mock-practice',
        date: today(),
        collegeId: body.collegeId,
        questions: generated.map((g) => ({ question: g.question })),
        createdBy: ctx.requester.username,
      } as Parameters<Data['interviews']['create']>[0]);
      return { status: 201, body: { session, categories: generated.map((g) => g.category) } };
    },

    // POST /interviews/mock/:sessionId/answer — score one answer with grounded AI feedback. Only the
    // session's creator may answer it (so a parent can't ground/overwrite keira's mock, and the
    // private-derived feedback only ever flows back to its owner).
    answer: async (ctx) => {
      const { sessionId } = validateParams(sessionParamSchema, ctx);
      const { questionIndex, answer } = validateBody(answerSchema, ctx);
      const data = getData();
      const session = await requireSession(sessionId);
      if (session.createdBy !== ctx.requester.username) {
        throw Errors.forbidden('Only the person who started this mock can answer its questions');
      }
      const questions = session.questions ?? [];
      const target = questions[questionIndex];
      if (!target) throw Errors.notFound(`No question at index ${questionIndex}`);

      // PRIVACY: grounding filters private entries unless keira is the caller.
      const grounding = await gatherGrounding(data, ctx.requester);
      const feedback = await feedbackGen({ question: target.question, answer, grounding });

      const updatedQuestions = questions.map((qn, i) =>
        i === questionIndex ? { ...qn, answer, aiFeedback: renderFeedback(feedback), rating: feedback.rating } : qn,
      );
      const updated = await data.interviews.update(sessionId, { questions: updatedQuestions });
      return { status: 200, body: { feedback, session: updated } };
    },

    // GET /interviews/questions — curated bank + the caller's custom questions, filterable.
    listQuestions: async (ctx) => {
      const q = validateQuery(questionQuerySchema, ctx);
      const custom = await loadCustomQuestions(getData(), ctx.requester.username);
      const all = [...QUESTION_BANK, ...custom];
      return { status: 200, body: { questions: filterBank(all, { category: q.category, search: q.search }) } };
    },

    // POST /interviews/questions — add a custom question (persisted per caller).
    addQuestion: async (ctx) => {
      const input = validateBody(addQuestionSchema, ctx);
      const data = getData();
      const requester: Requester = ctx.requester;
      const existing = await loadCustomQuestions(data, requester.username);
      const entry: BankQuestion = {
        id: `custom-${existing.length + 1}-${Date.now().toString(36)}`,
        question: input.question,
        category: input.category ?? 'general',
        starred: input.starred,
      };
      const next = [...existing, entry];
      const profile = await data.profiles.get(requester.username);
      if (profile) {
        await data.profiles.update(requester.username, {
          preferences: { ...(profile.preferences ?? {}), interviewQuestions: next },
        });
      } else {
        await data.profiles.put({
          userId: requester.username,
          name: requester.username,
          role: requester.role,
          preferences: { interviewQuestions: next },
        });
      }
      return { status: 201, body: entry };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede `:id`; the router also prefers higher static specificity. */
export function buildRoutes(h: InterviewHandlers) {
  return [
    { method: 'GET' as const, path: '/interviews/questions', handler: h.listQuestions },
    { method: 'POST' as const, path: '/interviews/questions', handler: h.addQuestion },
    { method: 'POST' as const, path: '/interviews/mock', handler: h.mock },
    { method: 'POST' as const, path: '/interviews/mock/:sessionId/answer', handler: h.answer },
    { method: 'GET' as const, path: '/interviews', handler: h.list },
    { method: 'POST' as const, path: '/interviews', handler: h.create },
    { method: 'GET' as const, path: '/interviews/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/interviews/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/interviews/:id', handler: h.remove },
  ];
}

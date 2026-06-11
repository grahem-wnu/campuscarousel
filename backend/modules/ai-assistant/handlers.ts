// AI Assistant handlers — the single most privacy-sensitive module. The model only ever receives
// records the CALLER is allowed to see: every visibility-bearing collection is run through
// `aiVisibleSet` keyed on ctx.requester BEFORE the prompt is built, so private entries reach the
// model only when keira is the authenticated caller and can never leak into grahem's or kate's chat.
// Conversations are per-user: a caller may only read/continue their OWN conversation. Handlers are
// built from `getData` / `getAssistant` thunks so tests inject fakes and production injects the live
// data client + Bedrock assistant (see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { aiVisibleSet } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { buildSummary, selectRecords } from './context.js';
import { resolveMode, type Assistant, type ChatMessage, type ContextBundle } from './chat.js';
import { chatSchema, idParamSchema } from './schema.js';

export interface AiHandlers {
  chat: Handler;
  listConversations: Handler;
  getConversation: Handler;
}

const HISTORY_LIMIT = 10;

export function makeHandlers(getData: () => Data, getAssistant: () => Assistant): AiHandlers {
  return {
    // POST /ai/chat — answer in context, grounded in the caller-visible slice of Keira's data.
    chat: async (ctx) => {
      const input = validateBody(chatSchema, ctx);
      const data = getData();
      const requester = ctx.requester;
      const mode = resolveMode(input.context);

      // If continuing a conversation, it must belong to the caller (never another user's).
      let history: ChatMessage[] = [];
      if (input.conversationId) {
        const convo = await data.conversations.get(input.conversationId);
        if (!convo || convo.userId !== requester.username) throw Errors.notFound('Conversation not found');
        const prior = await data.conversations.listMessages(input.conversationId);
        history = prior.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
      }

      // Assemble grounding context. Visibility-bearing collections are filtered with aiVisibleSet
      // keyed on the caller — this is the privacy boundary for the whole module.
      const [courses, teas, clinicalRaw, activitiesRaw, colleges, goals, whyRaw, scholarships] = await Promise.all([
        data.courses.list(),
        data.teas.list(),
        data.clinical.list(),
        data.activities.list(),
        data.colleges.list(),
        data.goals.list(),
        data.whyNursing.list(),
        data.scholarships.list(),
      ]);
      const clinical = aiVisibleSet(clinicalRaw, requester);
      const activities = aiVisibleSet(activitiesRaw, requester);
      const whyNursing = aiVisibleSet(whyRaw, requester);

      // The student's intended major(s) make the prompt major-aware (no hardcoded nursing). Tolerate
      // an absent profile — the prompt helpers fall back to neutral "their intended program" language.
      const studentProfile = await data.studentProfile.get().catch(() => null);

      const bundle: ContextBundle = {
        role: requester.role,
        mode,
        page: { module: input.context?.module, collegeId: input.context?.collegeId, essayId: input.context?.essayId },
        summary: buildSummary({ courses, teas, clinical, activities, colleges, goals }),
        records: selectRecords(mode, { whyNursing, activities, clinical, colleges, scholarships }),
        majors: studentProfile?.intendedMajors,
      };

      // Get the reply BEFORE any write, so a model failure (502/503) leaves no dangling records.
      const reply = await getAssistant().reply(bundle, history, input.message);

      const conversationId =
        input.conversationId ??
        (
          await data.conversations.create({
            userId: requester.username,
            context: input.context?.module,
            title: input.message.slice(0, 80),
          })
        ).conversationId;

      await data.conversations.addMessage(conversationId, {
        role: 'user',
        userId: requester.username,
        content: input.message,
        context: input.context?.module,
      });
      await data.conversations.addMessage(conversationId, {
        role: 'assistant',
        userId: requester.username,
        content: reply.response,
        context: input.context?.module,
        toolsUsed: reply.toolsUsed,
      });

      return {
        status: 200,
        body: { response: reply.response, conversationId, toolsUsed: reply.toolsUsed, citations: reply.citations },
      };
    },

    // GET /ai/conversations — only the caller's own conversations. The frozen ConversationRepo
    // indexes all conversations under a single GSI1 partition, so we read and filter by the
    // JWT-derived username here (no `limit` is passed, so the filter can't silently truncate a
    // user's set). A per-user GSI partition would let the data layer scope this at query time —
    // that's a foundational follow-up (shared/data is frozen and out of this module's lane).
    listConversations: async (ctx) => {
      const all = await getData().conversations.list();
      const conversations = all.filter((c) => c.userId === ctx.requester.username);
      return { status: 200, body: { conversations } };
    },

    // GET /ai/conversations/:id — the caller's own conversation + its messages; 404 for anyone
    // else's (a 404 rather than 403 so a parent can't even confirm one of Keira's exists).
    getConversation: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const convo = await data.conversations.get(id);
      if (!convo || convo.userId !== ctx.requester.username) throw Errors.notFound('Conversation not found');
      const messages = await data.conversations.listMessages(id);
      return { status: 200, body: { conversation: convo, messages } };
    },
  };
}

export function buildRoutes(handlers: AiHandlers): RouteDef[] {
  return [
    { method: 'POST', path: '/ai/chat', handler: handlers.chat },
    { method: 'GET', path: '/ai/conversations', handler: handlers.listConversations },
    { method: 'GET', path: '/ai/conversations/:id', handler: handlers.getConversation },
  ];
}

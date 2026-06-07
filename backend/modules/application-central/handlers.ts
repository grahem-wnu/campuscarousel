// Application Central handlers — essay workspace + AI essay partner + a derived application overview.
// Essays are the student's working documents; identity comes from the JWT and the router 401s
// unauthenticated callers. PRIVACY: /find-experiences grounds in activities/clinical/why-nursing via
// gatherExperiences (aiVisibleSet off the JWT) — private entries surface only when keira is the
// caller — and AI output is returned LIVE (never persisted), so it can't leak through a later read.

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data, Essay } from '../../shared/data/index.js';
import {
  addDraftSchema,
  createSchema,
  findExperiencesSchema,
  idParamSchema,
  listQuerySchema,
  reviewSchema,
  updateSchema,
} from './schema.js';
import { gatherExperiences } from './grounding.js';
import { buildOverview } from './overview.js';
import {
  makeBedrockEssayReviewer,
  makeBedrockExperienceFinder,
  wordCountOf,
  type EssayReviewer,
  type ExperienceFinder,
} from './ai.js';

export interface AppCentralHandlers {
  listEssays: Handler;
  detailEssay: Handler;
  createEssay: Handler;
  updateEssay: Handler;
  removeEssay: Handler;
  addDraft: Handler;
  findExperiences: Handler;
  review: Handler;
  overview: Handler;
}

export interface AppCentralDeps {
  getData: () => Data;
  finder?: ExperienceFinder;
  reviewer?: EssayReviewer;
  now?: () => Date;
}

type Draft = NonNullable<Essay['drafts']>[number];

export function makeHandlers(deps: AppCentralDeps): AppCentralHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const finder = deps.finder ?? makeBedrockExperienceFinder();
  const reviewer = deps.reviewer ?? makeBedrockEssayReviewer();

  async function requireEssay(id: string): Promise<Essay> {
    const e = await getData().essays.get(id);
    if (!e) throw Errors.notFound('Essay not found');
    return e;
  }

  const latestDraft = (essay: Essay): Draft | undefined => {
    const drafts = essay.drafts ?? [];
    return drafts.length ? drafts[drafts.length - 1] : undefined;
  };

  return {
    // GET /essays — list, filter by college / status.
    listEssays: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items = await getData().essays.list();
      if (q.collegeId) items = items.filter((e) => e.collegeId === q.collegeId);
      if (q.status) items = items.filter((e) => e.status === q.status);
      return { status: 200, body: { essays: items } };
    },

    // GET /essays/:id.
    detailEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      return { status: 200, body: await requireEssay(id) };
    },

    // POST /essays — create (defaults to brainstorming).
    createEssay: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().essays.create({
        ...input,
        status: input.status ?? 'brainstorming',
        createdBy: ctx.requester.username,
      } as Parameters<Data['essays']['create']>[0]);
      return { status: 201, body: created };
    },

    // PUT /essays/:id.
    updateEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      await requireEssay(id);
      return { status: 200, body: await getData().essays.update(id, patch) };
    },

    // DELETE /essays/:id.
    removeEssay: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await requireEssay(id);
      await getData().essays.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /essays/:id/draft — append a new version (version + wordCount computed), advance status.
    addDraft: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const { content } = validateBody(addDraftSchema, ctx);
      const essay = await requireEssay(id);
      const drafts = essay.drafts ?? [];
      const version = drafts.reduce((max, d) => Math.max(max, d.version), 0) + 1;
      const draft: Draft = { version, content, createdAt: now().toISOString(), wordCount: wordCountOf(content) };
      const status = essay.status === 'brainstorming' || essay.status === undefined ? 'drafting' : essay.status;
      const updated = await getData().essays.update(id, { drafts: [...drafts, draft], status });
      return { status: 201, body: updated };
    },

    // POST /essays/:id/find-experiences — AI surfaces relevant experiences (keira's private entries
    // included only for keira). Returned LIVE; never persisted.
    findExperiences: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(findExperiencesSchema, ctx);
      const data = getData();
      const essay = await requireEssay(id);
      const pool = await gatherExperiences(data, ctx.requester);
      const result = await finder({ prompt: body.prompt ?? essay.prompt ?? '', pool });
      return { status: 200, body: { result, basedOn: pool.counts } };
    },

    // POST /essays/:id/review — AI feedback on a draft. NEVER rewrites (review.rewrote === false).
    review: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(reviewSchema, ctx);
      const essay = await requireEssay(id);
      const content =
        body.content ??
        (body.version !== undefined ? (essay.drafts ?? []).find((d) => d.version === body.version)?.content : latestDraft(essay)?.content);
      if (!content) throw Errors.validation('No draft content to review — add a draft or pass content.');
      const review = await reviewer({ prompt: essay.prompt ?? '', content, targetWords: body.targetWords });
      return { status: 200, body: { review } };
    },

    // GET /applications/overview — derived per-college status (deadlines, essays, scores).
    overview: async () => {
      const data = getData();
      const [colleges, essays, teas] = await Promise.all([data.colleges.list(), data.essays.list(), data.teas.list()]);
      const todayIso = now().toISOString().slice(0, 10);
      return { status: 200, body: { applications: buildOverview(colleges, essays, teas, todayIso) } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede `:id`; the router also prefers higher static specificity. */
export function buildRoutes(h: AppCentralHandlers) {
  return [
    { method: 'GET' as const, path: '/applications/overview', handler: h.overview },
    { method: 'GET' as const, path: '/essays', handler: h.listEssays },
    { method: 'POST' as const, path: '/essays', handler: h.createEssay },
    { method: 'GET' as const, path: '/essays/:id', handler: h.detailEssay },
    { method: 'PUT' as const, path: '/essays/:id', handler: h.updateEssay },
    { method: 'DELETE' as const, path: '/essays/:id', handler: h.removeEssay },
    { method: 'POST' as const, path: '/essays/:id/draft', handler: h.addDraft },
    { method: 'POST' as const, path: '/essays/:id/find-experiences', handler: h.findExperiences },
    { method: 'POST' as const, path: '/essays/:id/review', handler: h.review },
  ];
}

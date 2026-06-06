// Application Central handlers — the Essay workspace. Essays themselves are family-visible, but the
// AI "find experiences" path is the CANONICAL private-data case: it reads Keira's journal, clinical
// hours, and why-nursing entries and narrows them with `aiVisibleSet` off the JWT, so the AI receives
// her private entries ONLY when Keira is the authenticated caller — never for a parent/admin, and
// private content is never surfaced in a parent-visible response. Identity is from ctx.requester;
// the creator is recorded server-side. Handlers are built from thunks so tests inject in-memory
// fakes and production injects the live data client + Bedrock finder/reviewer (routes.manifest.ts).

import {
  Errors,
  validate,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { aiVisibleSet } from '../../shared/auth/index.js';
import { isoNow, type Data } from '../../shared/data/index.js';
import type { EssayReviewer, ExperienceFinder } from './ai.js';
import { appendDraft, latestDraft } from './drafts.js';
import { toExperienceCandidates } from './experiences.js';
import {
  createSchema,
  findExperiencesSchema,
  idParamSchema,
  listQuerySchema,
  reviewSchema,
  updateSchema,
} from './schema.js';

export interface EssayHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  findExperiences: Handler;
  review: Handler;
}

export function makeHandlers(
  getData: () => Data,
  getFinder: () => ExperienceFinder,
  getReviewer: () => EssayReviewer,
): EssayHandlers {
  return {
    // GET /essays — filter by college / status.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const all = await getData().essays.list();
      const essays = all.filter(
        (e) =>
          (q.collegeId === undefined || e.collegeId === q.collegeId) &&
          (q.status === undefined || e.status === q.status),
      );
      return { status: 200, body: { essays } };
    },

    // GET /essays/:id.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const essay = await getData().essays.get(id);
      if (!essay) throw Errors.notFound('Essay not found');
      return { status: 200, body: essay };
    },

    // POST /essays — create; an optional first draft is stamped with version/wordCount/createdAt.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const { draftContent, ...rest } = input;
      const created = await getData().essays.create({
        ...rest,
        status: rest.status ?? 'brainstorming',
        drafts: draftContent !== undefined ? appendDraft(undefined, draftContent, isoNow()) : undefined,
        createdBy: ctx.requester.username,
      });
      return { status: 201, body: created };
    },

    // PUT /essays/:id — update fields and/or append a new draft version.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.essays.get(id);
      if (!existing) throw Errors.notFound('Essay not found');
      const { addDraftContent, ...rest } = patch;
      const next = { ...rest } as Parameters<typeof data.essays.update>[1];
      if (addDraftContent !== undefined) {
        next.drafts = appendDraft(existing.drafts, addDraftContent, isoNow());
      }
      const updated = await data.essays.update(id, next);
      return { status: 200, body: updated };
    },

    // DELETE /essays/:id.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.essays.get(id);
      if (!existing) throw Errors.notFound('Essay not found');
      await data.essays.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /essays/:id/find-experiences — AI selects relevant experiences. PRIVACY: the candidate set
    // is narrowed with aiVisibleSet off the JWT, so a parent's call never includes Keira's private
    // journal/clinical/why-nursing entries; Keira's call does. The chosen ids are stored on the essay.
    findExperiences: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validate(findExperiencesSchema, ctx.body ?? {}); // body is optional
      const data = getData();
      const essay = await data.essays.get(id);
      if (!essay) throw Errors.notFound('Essay not found');

      const [activities, clinical, whyNursing] = await Promise.all([
        data.activities.list(),
        data.clinical.list(),
        data.whyNursing.list(),
      ]);
      const candidates = aiVisibleSet(
        toExperienceCandidates(activities, clinical, whyNursing),
        ctx.requester,
      );
      const { experiences, angles } = await getFinder()({
        prompt: essay.prompt,
        focus: body.focus,
        candidates,
        limit: body.limit,
      });

      // Persist the AI's picks (ids + angles) so the workspace sidebar can rehydrate them.
      const updated = await data.essays.update(id, {
        aiSuggestedActivities: experiences.map((e) => `${e.source}:${e.id}`),
        aiSuggestedAngles: angles,
      });
      return { status: 200, body: { experiences, angles, essay: updated } };
    },

    // POST /essays/:id/review — AI feedback on a draft. Feedback ONLY; never rewrites the essay.
    review: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validate(reviewSchema, ctx.body ?? {}); // body is optional
      const essay = await getData().essays.get(id);
      if (!essay) throw Errors.notFound('Essay not found');
      const content = body.content ?? latestDraft(essay.drafts)?.content;
      if (!content) throw Errors.validation('No draft to review — add a draft or pass content');
      const feedback = await getReviewer()({ prompt: essay.prompt, content });
      return { status: 200, body: { feedback } };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test. The
 * static sub-routes (`/essays/:id/find-experiences`, `/essays/:id/review`) and `/essays/:id` are
 * distinct path shapes; the router resolves them unambiguously.
 */
export function buildRoutes(handlers: EssayHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/essays', handler: handlers.list },
    { method: 'POST', path: '/essays', handler: handlers.create },
    { method: 'GET', path: '/essays/:id', handler: handlers.detail },
    { method: 'PUT', path: '/essays/:id', handler: handlers.update },
    { method: 'DELETE', path: '/essays/:id', handler: handlers.remove },
    { method: 'POST', path: '/essays/:id/find-experiences', handler: handlers.findExperiences },
    { method: 'POST', path: '/essays/:id/review', handler: handlers.review },
  ];
}

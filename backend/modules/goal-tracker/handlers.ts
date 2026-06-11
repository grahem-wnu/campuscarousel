// Goal Tracker handlers. Goals are family-visible (specs/modules/goal-tracker.md "Privacy") — there
// is no `private` state, so every authenticated family member may read and write them. Identity
// still comes from the JWT (ctx.requester): the creator is recorded server-side, never trusted from
// the body. Handlers are built from `getData` / `getSuggester` thunks so tests inject in-memory
// fakes and production injects the live data client + Bedrock suggester (see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { isoNow, newId, type Data, type Goal } from '../../shared/data/index.js';
import { normaliseMilestones, progressFromMilestones } from './progress.js';
import { createSchema, idParamSchema, listQuerySchema, suggestSchema, updateSchema } from './schema.js';
import type { GoalSuggester } from './suggester.js';

export interface GoalHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  suggest: Handler;
}

const today = (): string => isoNow().slice(0, 10);

/** Read the active student's intended major(s) so goal suggestions reflect their academic focus. */
async function activeMajors(data: Data): Promise<string[]> {
  try {
    return (await data.studentProfile.get())?.intendedMajors ?? [];
  } catch {
    return [];
  }
}

export function makeHandlers(getData: () => Data, getSuggester: () => GoalSuggester): GoalHandlers {
  return {
    // GET /goals — whole collection, filtered in-handler by period/status/category.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const all = await getData().goals.list();
      const goals = all.filter(
        (g) =>
          (q.period === undefined || g.period === q.period) &&
          (q.status === undefined || g.status === q.status) &&
          (q.category === undefined || g.category === q.category),
      );
      return { status: 200, body: { goals } };
    },

    // GET /goals/:id.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const goal = await getData().goals.get(id);
      if (!goal) throw Errors.notFound('Goal not found');
      return { status: 200, body: goal };
    },

    // POST /goals — create. Records the creator from the JWT; never auto-saves AI suggestions
    // (the client posts an accepted/edited suggestion here like any other goal).
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const milestones = normaliseMilestones(input.milestones, newId, today());
      const created = await getData().goals.create({
        ...input,
        status: input.status ?? 'not-started',
        milestones,
        // Server owns progress: milestone completion drives it when milestones exist, otherwise the
        // manually-set value. So a non-UI consumer (e.g. the dashboard widget) reads a correct
        // Goal.progress, not a stale client value.
        progress: progressFromMilestones(milestones) ?? input.progress,
        createdBy: ctx.requester.username,
      });
      return { status: 201, body: created };
    },

    // PUT /goals/:id — update milestones, progress, status, etc.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.goals.get(id);
      if (!existing) throw Errors.notFound('Goal not found');

      const { milestones, ...rest } = patch;
      const normalised: Partial<Goal> = { ...rest };
      // The milestones the goal will have after this patch (unchanged if the patch omits them).
      let effectiveMilestones = existing.milestones;
      if (milestones !== undefined) {
        normalised.milestones = normaliseMilestones(milestones, newId, today());
        effectiveMilestones = normalised.milestones;
      }
      // Keep persisted progress authoritative: derive from the resulting milestones when any exist
      // (so toggling a milestone updates Goal.progress server-side), else honour an explicit manual
      // value. Untouched when the patch has neither milestones nor progress.
      const derived = progressFromMilestones(effectiveMilestones);
      if (derived !== null) normalised.progress = derived;
      else if (patch.progress !== undefined) normalised.progress = patch.progress;
      const updated = await data.goals.update(id, normalised);
      return { status: 200, body: updated };
    },

    // DELETE /goals/:id.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.goals.get(id);
      if (!existing) throw Errors.notFound('Goal not found');
      await data.goals.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /goals/suggest — AI returns an editable suggestion list; nothing is persisted here.
    suggest: async (ctx) => {
      const input = validateBody(suggestSchema, ctx);
      const majors = await activeMajors(getData());
      const suggestions = await getSuggester().suggest(input, majors);
      return { status: 200, body: { suggestions } };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test so
 * there is one source of truth for paths. `/goals/suggest` is listed before `/goals/:id`, and the
 * router prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: GoalHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/goals', handler: handlers.list },
    { method: 'POST', path: '/goals', handler: handlers.create },
    { method: 'POST', path: '/goals/suggest', handler: handlers.suggest },
    { method: 'GET', path: '/goals/:id', handler: handlers.detail },
    { method: 'PUT', path: '/goals/:id', handler: handlers.update },
    { method: 'DELETE', path: '/goals/:id', handler: handlers.remove },
  ];
}

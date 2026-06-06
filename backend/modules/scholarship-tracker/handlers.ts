// Scholarship Tracker handlers. Scholarships are family-visible (specs/modules/scholarship-tracker.md
// "Privacy") — no `private` state, so every authenticated family member may read and write. Identity
// still comes from the JWT (ctx.requester); the creator is recorded server-side via `addedBy`.
// Handlers are built from thunks so tests inject in-memory fakes and production injects the live data
// client, the AI discoverer, and the SQS hydration enqueuer (see routes.manifest.ts).
//
// The synchronous endpoints (CRUD + summary + bulk-add record creation) work today. AI discovery and
// SQS hydration are injected and currently degrade to a clean 503 until the async hydration infra
// lands (see discover.ts / hydration.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import type { Data, Scholarship } from '../../shared/data/index.js';
import type { ScholarshipDiscoverer } from './discover.js';
import { buildHydrationMessage, type HydrationEnqueuer } from './hydration.js';
import { summarize } from './summary.js';
import {
  bulkAddSchema,
  createSchema,
  discoverSchema,
  idParamSchema,
  listQuerySchema,
  updateSchema,
} from './schema.js';

export interface ScholarshipHandlers {
  list: Handler;
  summary: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  discover: Handler;
  bulkAdd: Handler;
  hydrate: Handler;
}

export function makeHandlers(
  getData: () => Data,
  getDiscoverer: () => ScholarshipDiscoverer,
  getEnqueuer: () => HydrationEnqueuer,
): ScholarshipHandlers {
  return {
    // GET /scholarships — whole collection, filtered in-handler by type/status/linkedCollege/deadline.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const all = await getData().scholarships.list();
      const scholarships = all.filter(
        (s) =>
          (q.type === undefined || s.type === q.type) &&
          (q.status === undefined || s.status === q.status) &&
          (q.linkedCollege === undefined || (s.linkedColleges ?? []).includes(q.linkedCollege)) &&
          (q.deadlineBefore === undefined ||
            (s.applicationDeadline !== undefined && s.applicationDeadline <= q.deadlineBefore)),
      );
      return { status: 200, body: { scholarships } };
    },

    // GET /scholarships/summary — totals + budget impact (reads the budget singleton).
    summary: async (ctx) => {
      void ctx;
      const data = getData();
      const [scholarships, budget] = await Promise.all([data.scholarships.list(), data.budget.get()]);
      return { status: 200, body: summarize(scholarships, budget) };
    },

    // GET /scholarships/:id.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const s = await getData().scholarships.get(id);
      if (!s) throw Errors.notFound('Scholarship not found');
      return { status: 200, body: s };
    },

    // POST /scholarships — manual add (creator recorded as `addedBy: 'manual'`).
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().scholarships.create({
        ...input,
        status: input.status ?? 'discovered',
        addedBy: 'manual',
      });
      return { status: 201, body: created };
    },

    // PUT /scholarships/:id.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.scholarships.get(id);
      if (!existing) throw Errors.notFound('Scholarship not found');
      const updated = await data.scholarships.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /scholarships/:id.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.scholarships.get(id);
      if (!existing) throw Errors.notFound('Scholarship not found');
      await data.scholarships.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /scholarships/discover — AI web-search discovery; returns selectable results, saves nothing.
    discover: async (ctx) => {
      const input = validateBody(discoverSchema, ctx);
      const results = await getDiscoverer().discover(input);
      return { status: 200, body: { results } };
    },

    // POST /scholarships/bulk-add — save selected discoveries (records created synchronously). If
    // `hydrate` is requested, enqueue AI hydration per item best-effort: a saved scholarship is never
    // lost just because the (currently-gated) hydration enqueue is unavailable.
    bulkAdd: async (ctx) => {
      const input = validateBody(bulkAddSchema, ctx);
      const data = getData();
      const created: Scholarship[] = [];
      for (const s of input.scholarships) {
        created.push(
          await data.scholarships.create({
            ...s,
            status: s.status ?? 'discovered',
            addedBy: 'ai-discovered',
            ...(input.hydrate ? { hydrationStatus: 'pending' } : {}),
          }),
        );
      }
      if (input.hydrate) {
        const enqueuer = getEnqueuer();
        await Promise.all(
          created.map((s) =>
            enqueuer
              .enqueue(buildHydrationMessage(s))
              .catch((err) => console.error('bulk-add: hydration enqueue failed (saved anyway)', s.scholarshipId, err)),
          ),
        );
      }
      return { status: 201, body: { scholarships: created } };
    },

    // POST /scholarships/:id/hydrate — enqueue an AI refresh for one scholarship (async; 202).
    hydrate: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.scholarships.get(id);
      if (!existing) throw Errors.notFound('Scholarship not found');
      // Enqueue first — if the queue is unavailable this throws (503) before we mutate state.
      await getEnqueuer().enqueue(buildHydrationMessage(existing));
      const updated = await data.scholarships.update(id, { hydrationStatus: 'pending' });
      return { status: 202, body: updated };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test so
 * there is one source of truth for paths. The static `/scholarships/summary` and
 * `/scholarships/discover` are listed before `/scholarships/:id`, and the router prefers static
 * segments, so they never collide.
 */
export function buildRoutes(handlers: ScholarshipHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/scholarships/summary', handler: handlers.summary },
    { method: 'GET', path: '/scholarships', handler: handlers.list },
    { method: 'POST', path: '/scholarships', handler: handlers.create },
    { method: 'POST', path: '/scholarships/discover', handler: handlers.discover },
    { method: 'POST', path: '/scholarships/bulk-add', handler: handlers.bulkAdd },
    { method: 'GET', path: '/scholarships/:id', handler: handlers.detail },
    { method: 'PUT', path: '/scholarships/:id', handler: handlers.update },
    { method: 'DELETE', path: '/scholarships/:id', handler: handlers.remove },
    { method: 'POST', path: '/scholarships/:id/hydrate', handler: handlers.hydrate },
  ];
}

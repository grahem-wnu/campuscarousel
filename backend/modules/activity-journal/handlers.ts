// Activity Journal handlers. Identity comes from the JWT (ctx.requester); every read of this
// visibility-bearing entity goes through the shared visibility middleware — the module never
// trusts a client filter. Handlers are built from a `getData` thunk so tests inject an in-memory
// data client and production injects `dataFromEnv()` (lazily, see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { assertCanRead, canSeePrivate, filterForRequester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { createSchema, idParamSchema, listQuerySchema, updateSchema } from './schema.js';
import { summarize } from './summary.js';

export interface JournalHandlers {
  list: Handler;
  summary: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

export function makeHandlers(getData: () => Data): JournalHandlers {
  return {
    // GET /activities — list, filtered by category/date range, then visibility-filtered.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const data = getData();
      let items;
      if (q.category) {
        items = await data.activities.listByCategory(q.category, { from: q.from, to: q.to });
      } else if (q.from !== undefined || q.to !== undefined) {
        items = await data.activities.listByDateRange(q.from ?? MIN_DATE, q.to ?? MAX_DATE);
      } else {
        items = await data.activities.list();
      }
      return { status: 200, body: { activities: filterForRequester(items, ctx.requester) } };
    },

    // GET /activities/summary — aggregate over the visibility-filtered set.
    summary: async (ctx) => {
      const items = await getData().activities.list();
      return { status: 200, body: summarize(filterForRequester(items, ctx.requester)) };
    },

    // GET /activities/:id — detail; a parent/admin cannot fetch a private entry.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().activities.get(id);
      if (!item) throw Errors.notFound('Activity not found');
      assertCanRead(item, ctx.requester);
      return { status: 200, body: item };
    },

    // POST /activities — any user may log on Keira's behalf; only Keira may mark private.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const visibility = input.visibility ?? 'family';
      if (visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const created = await getData().activities.create({
        ...input,
        visibility,
        userId: ctx.requester.username, // record the creator
      });
      return { status: 201, body: created };
    },

    // PUT /activities/:id — update; private entries are off-limits to non-students.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.activities.get(id);
      if (!existing) throw Errors.notFound('Activity not found');
      assertCanRead(existing, ctx.requester); // can't modify what you can't read
      if (patch.visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const updated = await data.activities.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /activities/:id — delete; private entries are off-limits to non-students.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.activities.get(id);
      if (!existing) throw Errors.notFound('Activity not found');
      assertCanRead(existing, ctx.requester);
      await data.activities.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. `/activities/summary` is listed before
 * `/activities/:id`, and the router also prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: JournalHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/activities/summary', handler: handlers.summary },
    { method: 'GET', path: '/activities', handler: handlers.list },
    { method: 'POST', path: '/activities', handler: handlers.create },
    { method: 'GET', path: '/activities/:id', handler: handlers.detail },
    { method: 'PUT', path: '/activities/:id', handler: handlers.update },
    { method: 'DELETE', path: '/activities/:id', handler: handlers.remove },
  ];
}

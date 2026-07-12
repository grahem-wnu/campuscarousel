// Motivation handlers — a living collection of the moments that crystallize why Keira wants to
// pursue her path. This is the most personal data in the app: visibility-bearing, and reads ALWAYS go
// through the shared visibility middleware off the JWT (ctx.requester) — the module never trusts a
// client filter. Private entries reach the AI only when keira is the authenticated caller; they
// are never shown to a parent or admin. Handlers are built from a `getData` thunk so tests inject
// an in-memory data client and production injects `dataFromEnv()` (lazily, see routes.manifest.ts).

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

export interface MotivationHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

export function makeHandlers(getData: () => Data): MotivationHandlers {
  return {
    // GET /motivations — list, optionally by date range, then category-filtered, then
    // visibility-filtered. (The collection has no category GSI; category is a cheap in-memory
    // filter over the visibility-filtered set.)
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const data = getData();
      const items =
        q.from !== undefined || q.to !== undefined
          ? await data.motivations.listByDateRange(q.from ?? MIN_DATE, q.to ?? MAX_DATE)
          : await data.motivations.list();
      const visible = filterForRequester(items, ctx.requester);
      const entries = q.category ? visible.filter((e) => e.category === q.category) : visible;
      return { status: 200, body: { entries } };
    },

    // GET /motivations/:id — detail; a parent/admin cannot fetch a private entry.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().motivations.get(id);
      if (!item) throw Errors.notFound('Motivation entry not found');
      assertCanRead(item, ctx.requester);
      return { status: 200, body: item };
    },

    // POST /motivations — any user may add on Keira's behalf; only Keira may mark private.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const visibility = input.visibility ?? 'family';
      if (visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const created = await getData().motivations.create({ ...input, visibility });
      return { status: 201, body: created };
    },

    // PUT /motivations/:id — update; private entries are off-limits to non-students.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.motivations.get(id);
      if (!existing) throw Errors.notFound('Motivation entry not found');
      assertCanRead(existing, ctx.requester); // can't modify what you can't read
      if (patch.visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const updated = await data.motivations.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /motivations/:id — delete; private entries are off-limits to non-students.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.motivations.get(id);
      if (!existing) throw Errors.notFound('Motivation entry not found');
      assertCanRead(existing, ctx.requester);
      await data.motivations.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. The static `/motivations` collection routes are
 * listed before the `/:id` routes; the router also prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: MotivationHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/motivations', handler: handlers.list },
    { method: 'POST', path: '/motivations', handler: handlers.create },
    { method: 'GET', path: '/motivations/:id', handler: handlers.detail },
    { method: 'PUT', path: '/motivations/:id', handler: handlers.update },
    { method: 'DELETE', path: '/motivations/:id', handler: handlers.remove },
  ];
}

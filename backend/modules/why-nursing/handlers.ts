// "Why Nursing" handlers — a living collection of the moments that crystallize why Keira wants to
// be a nurse. This is the most personal data in the app: visibility-bearing, and reads ALWAYS go
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

export interface WhyNursingHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

export function makeHandlers(getData: () => Data): WhyNursingHandlers {
  return {
    // GET /why-nursing — list, optionally by date range, then category-filtered, then
    // visibility-filtered. (The collection has no category GSI; category is a cheap in-memory
    // filter over the visibility-filtered set.)
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const data = getData();
      const items =
        q.from !== undefined || q.to !== undefined
          ? await data.whyNursing.listByDateRange(q.from ?? MIN_DATE, q.to ?? MAX_DATE)
          : await data.whyNursing.list();
      const visible = filterForRequester(items, ctx.requester);
      const entries = q.category ? visible.filter((e) => e.category === q.category) : visible;
      return { status: 200, body: { entries } };
    },

    // GET /why-nursing/:id — detail; a parent/admin cannot fetch a private entry.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().whyNursing.get(id);
      if (!item) throw Errors.notFound('Why Nursing entry not found');
      assertCanRead(item, ctx.requester);
      return { status: 200, body: item };
    },

    // POST /why-nursing — any user may add on Keira's behalf; only Keira may mark private.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const visibility = input.visibility ?? 'family';
      if (visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const created = await getData().whyNursing.create({ ...input, visibility });
      return { status: 201, body: created };
    },

    // PUT /why-nursing/:id — update; private entries are off-limits to non-students.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.whyNursing.get(id);
      if (!existing) throw Errors.notFound('Why Nursing entry not found');
      assertCanRead(existing, ctx.requester); // can't modify what you can't read
      if (patch.visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const updated = await data.whyNursing.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /why-nursing/:id — delete; private entries are off-limits to non-students.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.whyNursing.get(id);
      if (!existing) throw Errors.notFound('Why Nursing entry not found');
      assertCanRead(existing, ctx.requester);
      await data.whyNursing.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. The static `/why-nursing` collection routes are
 * listed before the `/:id` routes; the router also prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: WhyNursingHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/why-nursing', handler: handlers.list },
    { method: 'POST', path: '/why-nursing', handler: handlers.create },
    { method: 'GET', path: '/why-nursing/:id', handler: handlers.detail },
    { method: 'PUT', path: '/why-nursing/:id', handler: handlers.update },
    { method: 'DELETE', path: '/why-nursing/:id', handler: handlers.remove },
  ];
}

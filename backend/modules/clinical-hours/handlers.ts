// Clinical Hours handlers. Identity comes from the JWT (ctx.requester); every read of this
// visibility-bearing entity goes through the shared visibility middleware — the module never trusts
// a client filter. Handlers are built from a `getData` thunk so tests inject an in-memory data
// client and production injects `dataFromEnv()` lazily (see routes.manifest.ts). Mirrors the
// activity-journal reference module's privacy enforcement.

import {
  Errors,
  validate,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { assertCanRead, canSeePrivate, filterForRequester } from '../../shared/auth/index.js';
import { isoNow, type Clinical, type Data } from '../../shared/data/index.js';
import { renderClinicalPdf } from './pdf.js';
import { createSchema, exportSchema, idParamSchema, listQuerySchema, updateSchema } from './schema.js';
import { summarize } from './summary.js';
import { buildDirectory } from './supervisors.js';

export interface ClinicalHandlers {
  list: Handler;
  summary: Handler;
  supervisors: Handler;
  exportPdf: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

/** Fetch entries for the given filters (facility uses GSI3, dates use the collection index, the
 *  department filter is applied in-memory). Visibility filtering is the caller's responsibility. */
async function fetchFiltered(
  data: Data,
  filters: { facility?: string; department?: string; from?: string; to?: string },
): Promise<Clinical[]> {
  let items: Clinical[];
  if (filters.facility) {
    items = await data.clinical.listByFacility(filters.facility, { from: filters.from, to: filters.to });
  } else if (filters.from !== undefined || filters.to !== undefined) {
    items = await data.clinical.listByDateRange(filters.from ?? MIN_DATE, filters.to ?? MAX_DATE);
  } else {
    items = await data.clinical.list();
  }
  if (filters.department) {
    items = items.filter((c) => c.department === filters.department);
  }
  return items;
}

export function makeHandlers(getData: () => Data): ClinicalHandlers {
  return {
    // GET /clinical — list, filtered by facility/department/date range, then visibility-filtered.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const items = await fetchFiltered(getData(), q);
      return { status: 200, body: { entries: filterForRequester(items, ctx.requester) } };
    },

    // GET /clinical/summary — aggregate over the visibility-filtered set.
    summary: async (ctx) => {
      const items = await getData().clinical.list();
      return { status: 200, body: summarize(filterForRequester(items, ctx.requester)) };
    },

    // GET /clinical/supervisors — directory derived from the visibility-filtered entries.
    supervisors: async (ctx) => {
      const items = await getData().clinical.list();
      return { status: 200, body: { supervisors: buildDirectory(filterForRequester(items, ctx.requester)) } };
    },

    // POST /clinical/export — a PDF of the visibility-filtered entries, base64 in a JSON envelope.
    exportPdf: async (ctx) => {
      const input = validate(exportSchema, ctx.body ?? {});
      const items = await fetchFiltered(getData(), input);
      const visible = filterForRequester(items, ctx.requester);
      const pdf = renderClinicalPdf({ studentName: input.studentName, generatedAt: isoNow(), entries: visible });
      return {
        status: 200,
        body: {
          filename: 'clinical-hours.pdf',
          contentType: 'application/pdf',
          base64: Buffer.from(pdf).toString('base64'),
        },
      };
    },

    // GET /clinical/:id — detail; a parent/admin cannot fetch a private entry.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().clinical.get(id);
      if (!item) throw Errors.notFound('Clinical entry not found');
      assertCanRead(item, ctx.requester);
      return { status: 200, body: item };
    },

    // POST /clinical — any user may log on Keira's behalf; only Keira may mark private.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const visibility = input.visibility ?? 'family';
      if (visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const created = await getData().clinical.create({ ...input, visibility });
      return { status: 201, body: created };
    },

    // PUT /clinical/:id — update; private entries are off-limits to non-students.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.clinical.get(id);
      if (!existing) throw Errors.notFound('Clinical entry not found');
      assertCanRead(existing, ctx.requester); // can't modify what you can't read
      if (patch.visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const updated = await data.clinical.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /clinical/:id — delete; private entries are off-limits to non-students.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.clinical.get(id);
      if (!existing) throw Errors.notFound('Clinical entry not found');
      assertCanRead(existing, ctx.requester);
      await data.clinical.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. The static `/clinical/...` routes are listed before
 * `/clinical/:id`; the router also prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: ClinicalHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/clinical/summary', handler: handlers.summary },
    { method: 'GET', path: '/clinical/supervisors', handler: handlers.supervisors },
    { method: 'POST', path: '/clinical/export', handler: handlers.exportPdf },
    { method: 'GET', path: '/clinical', handler: handlers.list },
    { method: 'POST', path: '/clinical', handler: handlers.create },
    { method: 'GET', path: '/clinical/:id', handler: handlers.detail },
    { method: 'PUT', path: '/clinical/:id', handler: handlers.update },
    { method: 'DELETE', path: '/clinical/:id', handler: handlers.remove },
  ];
}

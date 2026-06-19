// Experience Hours handlers. Identity comes from the JWT (ctx.requester); every read of this
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
import { experienceVocab } from '../../shared/packs/index.js';
import { isoNow, type ExperienceEntry, type Data } from '../../shared/data/index.js';
import { renderExperiencePdf } from './pdf.js';
import { createSchema, exportSchema, idParamSchema, listQuerySchema, updateSchema } from './schema.js';
import { summarize } from './summary.js';
import { buildDirectory } from './supervisors.js';

export interface ExperienceHandlers {
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
): Promise<ExperienceEntry[]> {
  let items: ExperienceEntry[];
  if (filters.facility) {
    items = await data.experiences.listByFacility(filters.facility, { from: filters.from, to: filters.to });
  } else if (filters.from !== undefined || filters.to !== undefined) {
    items = await data.experiences.listByDateRange(filters.from ?? MIN_DATE, filters.to ?? MAX_DATE);
  } else {
    items = await data.experiences.list();
  }
  if (filters.department) {
    items = items.filter((c) => c.department === filters.department);
  }
  return items;
}

export function makeHandlers(getData: () => Data): ExperienceHandlers {
  return {
    // GET /experience — list, filtered by facility/department/date range, then visibility-filtered.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const items = await fetchFiltered(getData(), q);
      return { status: 200, body: { entries: filterForRequester(items, ctx.requester) } };
    },

    // GET /experience/summary — aggregate over the visibility-filtered set, plus major-aware labels
    // so the module reads for the student's path (not nursing) — see experienceVocab.
    summary: async (ctx) => {
      const [items, profile] = await Promise.all([getData().experiences.list(), getData().studentProfile.get()]);
      return {
        status: 200,
        body: { ...summarize(filterForRequester(items, ctx.requester)), labels: experienceVocab(profile?.intendedMajors ?? []) },
      };
    },

    // GET /experience/supervisors — directory derived from the visibility-filtered entries.
    supervisors: async (ctx) => {
      const items = await getData().experiences.list();
      return { status: 200, body: { supervisors: buildDirectory(filterForRequester(items, ctx.requester)) } };
    },

    // POST /experience/export — a PDF of the visibility-filtered entries, base64 in a JSON envelope.
    exportPdf: async (ctx) => {
      const input = validate(exportSchema, ctx.body ?? {});
      const items = await fetchFiltered(getData(), input);
      const visible = filterForRequester(items, ctx.requester);
      const pdf = renderExperiencePdf({ studentName: input.studentName, generatedAt: isoNow(), entries: visible });
      return {
        status: 200,
        body: {
          filename: 'experience-hours.pdf',
          contentType: 'application/pdf',
          base64: Buffer.from(pdf).toString('base64'),
        },
      };
    },

    // GET /experience/:id — detail; a parent/admin cannot fetch a private entry.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().experiences.get(id);
      if (!item) throw Errors.notFound('Experience entry not found');
      assertCanRead(item, ctx.requester);
      return { status: 200, body: item };
    },

    // POST /experience — any user may log on Keira's behalf; only Keira may mark private.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const visibility = input.visibility ?? 'family';
      if (visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const created = await getData().experiences.create({ ...input, visibility });
      return { status: 201, body: created };
    },

    // PUT /experience/:id — update; private entries are off-limits to non-students.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.experiences.get(id);
      if (!existing) throw Errors.notFound('Experience entry not found');
      assertCanRead(existing, ctx.requester); // can't modify what you can't read
      if (patch.visibility === 'private' && !canSeePrivate(ctx.requester)) {
        throw Errors.forbidden('Only Keira may mark an entry private');
      }
      const updated = await data.experiences.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /experience/:id — delete; private entries are off-limits to non-students.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.experiences.get(id);
      if (!existing) throw Errors.notFound('Experience entry not found');
      assertCanRead(existing, ctx.requester);
      await data.experiences.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. The static `/experience/...` routes are listed before
 * `/experience/:id`; the router also prefers static segments, so they never collide.
 */
export function buildRoutes(handlers: ExperienceHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/experience/summary', handler: handlers.summary },
    { method: 'GET', path: '/experience/supervisors', handler: handlers.supervisors },
    { method: 'POST', path: '/experience/export', handler: handlers.exportPdf },
    { method: 'GET', path: '/experience', handler: handlers.list },
    { method: 'POST', path: '/experience', handler: handlers.create },
    { method: 'GET', path: '/experience/:id', handler: handlers.detail },
    { method: 'PUT', path: '/experience/:id', handler: handlers.update },
    { method: 'DELETE', path: '/experience/:id', handler: handlers.remove },
  ];
}

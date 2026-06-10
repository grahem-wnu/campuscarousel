// Financial Aid Center handlers (v2.1 Module 19): track FAFSA/CSS + per-school aid deadlines and
// award letters, with a one-click "seed" for the standard federal forms and a summary that feeds the
// dashboard. Deadlines flow into the Master Timeline + reminder digest (see master-timeline/events.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data, FinAidItem } from '../../shared/data/index.js';
import { createSchema, idParamSchema, listQuerySchema, seedSchema, updateSchema } from './schema.js';

export interface FinAidHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  seed: Handler;
  summary: Handler;
}

export interface FinAidDeps {
  getData: () => Data;
}

/** The standard federal forms for a graduating class. FAFSA opens ~Oct 1 of senior fall; the federal
 *  deadline is the following June 30. CSS Profile opens with FAFSA; priority dates vary by school. */
function standardItems(classYear: number): Array<Omit<FinAidItem, 'itemId' | 'createdAt' | 'updatedAt'>> {
  const seniorFall = classYear - 1;
  return [
    {
      kind: 'fafsa',
      title: `FAFSA — Class of ${classYear}`,
      openDate: `${seniorFall}-10-01`,
      deadline: `${classYear}-06-30`,
      status: 'not-started',
    },
    {
      kind: 'css-profile',
      title: `CSS Profile — Class of ${classYear}`,
      openDate: `${seniorFall}-10-01`,
      priorityDeadline: `${seniorFall}-11-01`,
      status: 'not-started',
    },
  ];
}

export function makeHandlers(deps: FinAidDeps): FinAidHandlers {
  const { getData } = deps;

  return {
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items = await getData().finaid.list();
      if (q.kind) items = items.filter((i) => i.kind === q.kind);
      if (q.status) items = items.filter((i) => i.status === q.status);
      if (q.relatedCollegeId) items = items.filter((i) => i.relatedCollegeId === q.relatedCollegeId);
      return { status: 200, body: { items } };
    },

    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().finaid.get(id);
      if (!item) throw Errors.notFound('Financial aid item not found');
      return { status: 200, body: item };
    },

    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().finaid.create({ ...input, status: input.status ?? 'not-started' });
      return { status: 201, body: created };
    },

    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const existing = await getData().finaid.get(id);
      if (!existing) throw Errors.notFound('Financial aid item not found');
      const updated = await getData().finaid.update(id, patch);
      return { status: 200, body: updated };
    },

    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await getData().finaid.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /finaid/seed — create the standard FAFSA/CSS items for a class year, skipping any already present.
    seed: async (ctx) => {
      const { classYear } = validateBody(seedSchema, ctx);
      const data = getData();
      const existing = await data.finaid.list();
      const haveKinds = new Set(existing.map((i) => i.kind));
      const created: FinAidItem[] = [];
      for (const item of standardItems(classYear)) {
        if (haveKinds.has(item.kind)) continue; // idempotent
        created.push(await data.finaid.create(item));
      }
      return { status: 201, body: { added: created.length, items: created } };
    },

    // GET /finaid/summary — counts by status + the soonest deadline (feeds the dashboard).
    summary: async () => {
      const items = await getData().finaid.list();
      const byStatus: Record<string, number> = {};
      let nearest: { title: string; deadline: string } | undefined;
      for (const i of items) {
        byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
        if (i.status !== 'n/a' && i.deadline && (!nearest || i.deadline < nearest.deadline)) {
          nearest = { title: i.title, deadline: i.deadline };
        }
      }
      return { status: 200, body: { total: items.length, byStatus, nearestDeadline: nearest ?? null } };
    },
  };
}

/** Single source of truth for the route table. Static segments (seed, summary) precede :id. */
export function buildRoutes(h: FinAidHandlers) {
  return [
    { method: 'GET' as const, path: '/finaid', handler: h.list },
    { method: 'POST' as const, path: '/finaid/seed', handler: h.seed },
    { method: 'GET' as const, path: '/finaid/summary', handler: h.summary },
    { method: 'POST' as const, path: '/finaid', handler: h.create },
    { method: 'GET' as const, path: '/finaid/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/finaid/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/finaid/:id', handler: h.remove },
  ];
}

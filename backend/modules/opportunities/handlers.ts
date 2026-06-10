// Opportunity Finder handlers (v2.1 Module 18): CRUD + async web-grounded discovery that mirrors
// college/scholarship discovery (POST returns 202 + a job; the frontend polls). Opportunities are
// family-visible (no private axis). Built from injectable deps (in-memory data + stub discoverer in
// tests; production injects the SQS enqueuer so the slow search runs on the worker).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data, Opportunity } from '../../shared/data/index.js';
import { makeBedrockDiscoverer, type Discoverer } from './ai.js';
import { runDiscoveryJob, type DiscoverDispatcher } from './discover.js';
import {
  bulkAddSchema,
  createSchema,
  discoverSchema,
  idParamSchema,
  jobIdParamSchema,
  listQuerySchema,
  updateSchema,
} from './schema.js';

export interface OpportunityHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  discover: Handler;
  discoverStatus: Handler;
  bulkAdd: Handler;
}

export interface OpportunityDeps {
  getData: () => Data;
  discoverer?: Discoverer;
  /** Discovery-job trigger; defaults to running inline with this handler's discoverer. */
  discoverDispatch?: DiscoverDispatcher;
}

export function makeHandlers(deps: OpportunityDeps): OpportunityHandlers {
  const { getData } = deps;
  const discoverer = deps.discoverer ?? makeBedrockDiscoverer();
  const discoverDispatch =
    deps.discoverDispatch ?? ((jobId: string) => runDiscoveryJob(getData, discoverer, jobId));

  return {
    // GET /opportunities — list, filterable by type/status and a free-text search.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items = await getData().opportunities.list();
      if (q.type) items = items.filter((o) => o.type === q.type);
      if (q.status) items = items.filter((o) => o.status === q.status);
      if (q.search) {
        const needle = q.search.toLowerCase();
        items = items.filter((o) =>
          [o.name, o.organization, o.description].some((f) => f?.toLowerCase().includes(needle)),
        );
      }
      return { status: 200, body: { opportunities: items } };
    },

    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().opportunities.get(id);
      if (!item) throw Errors.notFound('Opportunity not found');
      return { status: 200, body: item };
    },

    // POST /opportunities — manual add (defaults to "interested").
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().opportunities.create({
        ...input,
        status: input.status ?? 'interested',
        addedBy: 'manual',
      });
      return { status: 201, body: created };
    },

    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const existing = await getData().opportunities.get(id);
      if (!existing) throw Errors.notFound('Opportunity not found');
      const updated = await getData().opportunities.update(id, patch);
      return { status: 200, body: updated };
    },

    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await getData().opportunities.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /opportunities/discover — start an ASYNC discovery job, return its id (202). Inline in tests.
    discover: async (ctx) => {
      const input = validateBody(discoverSchema, ctx);
      const job = await getData().opportunityDiscoveryJobs.create({ status: 'pending', filters: input });
      await discoverDispatch(job.jobId);
      const after = await getData().opportunityDiscoveryJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /opportunities/discover/:jobId — poll a discovery job.
    discoverStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().opportunityDiscoveryJobs.get(jobId);
      if (!job) throw Errors.notFound('Discovery job not found');
      return { status: 200, body: job };
    },

    // POST /opportunities/bulk-add — save selected discovered opportunities.
    bulkAdd: async (ctx) => {
      const { items } = validateBody(bulkAddSchema, ctx);
      const created: Opportunity[] = [];
      for (const item of items) {
        created.push(
          await getData().opportunities.create({
            ...item,
            type: item.type ?? 'other',
            status: 'discovered',
            addedBy: 'ai-discovered',
          }),
        );
      }
      return { status: 201, body: { added: created.length, opportunities: created } };
    },
  };
}

/** Single source of truth for the route table. Static segments (discover, bulk-add) precede :id. */
export function buildRoutes(h: OpportunityHandlers) {
  return [
    { method: 'GET' as const, path: '/opportunities', handler: h.list },
    { method: 'POST' as const, path: '/opportunities/discover', handler: h.discover },
    { method: 'GET' as const, path: '/opportunities/discover/:jobId', handler: h.discoverStatus },
    { method: 'POST' as const, path: '/opportunities/bulk-add', handler: h.bulkAdd },
    { method: 'POST' as const, path: '/opportunities', handler: h.create },
    { method: 'GET' as const, path: '/opportunities/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/opportunities/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/opportunities/:id', handler: h.remove },
  ];
}

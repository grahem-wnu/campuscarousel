// College Scholarship Research handlers. These awards are family-visible (no `visibility` field, no
// private-entry rule — same as Scholarship Tracker); identity comes from the JWT and the router
// 401s unauthenticated callers and blocks view-only members from the mutating routes.
//
// Both AI jobs are dispatched through injectable seams, so tests run them inline with a fake
// generator and production injects the SQS enqueuers (routes.manifest.ts). The two POST routes
// return 202 — the work happens on the 300s worker and the frontend polls.

import { Errors, validateBody, validateParams, type Handler } from '../../shared/api/index.js';
import type { CollegeScholarship, Data } from '../../shared/data/index.js';
import type { ScholarshipResearcher } from './research.js';
import type { ScholarshipSearcher } from './search.js';
import {
  makeSqsResearchEnqueuer,
  makeSqsSearchEnqueuer,
  type ResearchDispatcher,
  type SearchDispatcher,
} from './jobs.js';
import { collegeParamSchema, researchSchema, scholarshipParamSchema, searchSchema } from './schema.js';

export interface ScholarshipHandlers {
  list: Handler;
  search: Handler;
  detail: Handler;
  research: Handler;
  remove: Handler;
}

export interface ScholarshipDeps {
  getData: () => Data;
  /** Search trigger; defaults to the SQS enqueuer (which falls back to inline). */
  searchDispatch?: SearchDispatcher;
  /** Research trigger; defaults to the SQS enqueuer (which falls back to inline). */
  researchDispatch?: ResearchDispatcher;
  /** AI seams used by the default inline fallbacks — tests inject fakes so nothing hits Bedrock. */
  searcher?: ScholarshipSearcher;
  researcher?: ScholarshipResearcher;
}

export function makeHandlers(deps: ScholarshipDeps): ScholarshipHandlers {
  const { getData } = deps;
  const searchDispatch = deps.searchDispatch ?? makeSqsSearchEnqueuer(getData, { searcher: deps.searcher });
  const researchDispatch = deps.researchDispatch ?? makeSqsResearchEnqueuer(getData, { researcher: deps.researcher });

  /** 404 rather than an empty list when the college itself is gone — the tab is meaningless without it. */
  async function requireCollege(id: string): Promise<void> {
    if (!(await getData().colleges.get(id))) throw Errors.notFound('College not found');
  }

  async function requireScholarship(collegeId: string, scholarshipId: string): Promise<CollegeScholarship> {
    const found = await getData().collegeScholarships.get(collegeId, scholarshipId);
    if (!found) throw Errors.notFound('Scholarship not found');
    return found;
  }

  return {
    // GET /colleges/:id/scholarships — the search state plus every award found so far.
    list: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      await requireCollege(id);
      const data = getData();
      const [search, scholarships] = await Promise.all([
        data.collegeScholarshipSearch.get(id),
        data.collegeScholarships.list(id),
      ]);
      return { status: 200, body: { search, scholarships } };
    },

    // POST /colleges/:id/scholarships/search — start a web-grounded sweep of this school's awards.
    // Marks the singleton 'in-progress' (recording the requested filter, which the worker reads back),
    // enqueues, and returns 202. When no queue is configured the dispatcher runs inline, so the
    // returned state is already settled.
    search: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const body = validateBody(searchSchema, ctx);
      await requireCollege(id);
      const data = getData();
      // The worker reads these back, so the request's intent has to be persisted before dispatch.
      // An empty/whitespace query is stored as undefined so "searched for nothing" and "swept
      // broadly" stay the same thing — the job branches on exactly that distinction.
      await data.collegeScholarshipSearch.patch(id, {
        status: 'in-progress',
        query: body.query?.trim() || undefined,
        category: body.category ?? 'all',
        sport: body.sport,
        error: undefined,
      });
      await searchDispatch(id);
      const [search, scholarships] = await Promise.all([
        data.collegeScholarshipSearch.get(id),
        data.collegeScholarships.list(id),
      ]);
      return { status: 202, body: { search, scholarships } };
    },

    // GET /colleges/:id/scholarships/:scholarshipId — one award (what the research poll reads).
    detail: async (ctx) => {
      const { id, scholarshipId } = validateParams(scholarshipParamSchema, ctx);
      await requireCollege(id);
      return { status: 200, body: await requireScholarship(id, scholarshipId) };
    },

    // POST /colleges/:id/scholarships/:scholarshipId/research — start the deep dossier job.
    research: async (ctx) => {
      const { id, scholarshipId } = validateParams(scholarshipParamSchema, ctx);
      validateBody(researchSchema, ctx);
      await requireCollege(id);
      await requireScholarship(id, scholarshipId);
      const data = getData();
      await data.collegeScholarships.update(id, scholarshipId, { researchStatus: 'in-progress' });
      await researchDispatch(id, scholarshipId);
      return { status: 202, body: await requireScholarship(id, scholarshipId) };
    },

    // DELETE /colleges/:id/scholarships/:scholarshipId — drop an award the family doesn't care about.
    remove: async (ctx) => {
      const { id, scholarshipId } = validateParams(scholarshipParamSchema, ctx);
      await requireCollege(id);
      const found = await requireScholarship(id, scholarshipId);
      await getData().collegeScholarships.delete(id, scholarshipId);
      return { status: 200, body: found };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test), so the two
 *  can never drift. Static segments come before the `:scholarshipId` routes. */
export function buildRoutes(h: ScholarshipHandlers) {
  return [
    { method: 'GET' as const, path: '/colleges/:id/scholarships', handler: h.list },
    { method: 'POST' as const, path: '/colleges/:id/scholarships/search', handler: h.search },
    { method: 'GET' as const, path: '/colleges/:id/scholarships/:scholarshipId', handler: h.detail },
    { method: 'POST' as const, path: '/colleges/:id/scholarships/:scholarshipId/research', handler: h.research },
    { method: 'DELETE' as const, path: '/colleges/:id/scholarships/:scholarshipId', handler: h.remove },
  ];
}

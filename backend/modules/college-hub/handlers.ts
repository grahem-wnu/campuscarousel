// College Hub handlers. College data is family-visible (specs/modules/college-hub.md) — no private
// filtering — but identity comes from the JWT (ctx.requester) and the router 401s unauthenticated
// callers. Handlers are built from injectable deps so tests supply an in-memory data client, a stub
// discoverer, and a stub hydration dispatcher; production injects the real ones (lazily, see
// routes.manifest.ts). Hydration runs through the `dispatch` seam (inline today; SQS once wired).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { College, Data } from '../../shared/data/index.js';
import {
  bulkAddSchema,
  checklistSchema,
  createSchema,
  discoverSchema,
  idParamSchema,
  jobIdParamSchema,
  listQuerySchema,
  noteSchema,
  topPickSchema,
  updateSchema,
} from './schema.js';
import { queryColleges } from './query.js';
import { findActiveByName, normalizeCollegeName } from './dedupe.js';
import type { Discoverer } from './ai.js';
import { makeInlineDispatcher, type HydrationDispatcher } from './hydration.js';
import { runDiscoveryJob, type DiscoverDispatcher } from './discover.js';
import { makeAssetsEnqueuer, type AssetsDispatcher } from './assets-enqueue.js';

export interface CollegeHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  topPick: Handler;
  hydrate: Handler;
  hydrateAll: Handler;
  assetsBackfill: Handler;
  discover: Handler;
  discoverStatus: Handler;
  bulkAdd: Handler;
  listNotes: Handler;
  addNote: Handler;
  getChecklist: Handler;
  putChecklist: Handler;
}

export interface CollegeDeps {
  getData: () => Data;
  /** Discovery source for /discover; defaults to the Bedrock discoverer (→ [] on failure). */
  discoverer?: Discoverer;
  /** Hydration trigger; defaults to the inline dispatcher (SQS enqueue once the worker is wired). */
  dispatch?: HydrationDispatcher;
  /** Discovery-job trigger; defaults to running the job inline with the handler's discoverer. */
  discoverDispatch?: DiscoverDispatcher;
  /** Campus-imagery / logo fetch trigger; defaults to the SQS assets enqueuer (no-op if unconfigured). */
  assetsDispatch?: AssetsDispatcher;
}

export function makeHandlers(deps: CollegeDeps): CollegeHandlers {
  const { getData } = deps;
  const dispatch = deps.dispatch ?? makeInlineDispatcher(getData);
  // Default: run the discovery job inline using THIS handler's discoverer (so tests use the stub).
  // Production injects the SQS enqueuer (routes.manifest) so the slow web-grounded search runs on the
  // 300s worker instead of the 30s API request.
  // Pass deps.discoverer (the test stub, or undefined) so the default inline run resolves the
  // student's majors and builds a major-aware Bedrock discoverer when none is injected.
  const discoverDispatch =
    deps.discoverDispatch ?? ((jobId: string) => runDiscoveryJob(getData, deps.discoverer, jobId));
  const assetsDispatch = deps.assetsDispatch ?? makeAssetsEnqueuer(getData);

  /** Fetch a college or throw 404. */
  async function requireCollege(id: string): Promise<College> {
    const c = await getData().colleges.get(id);
    if (!c) throw Errors.notFound('College not found');
    return c;
  }

  return {
    // GET /colleges — filter + search + sort (removed hidden unless includeRemoved=true).
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const items = await getData().colleges.list();
      return { status: 200, body: { colleges: queryColleges(items, q) } };
    },

    // GET /colleges/:id.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      return { status: 200, body: await requireCollege(id) };
    },

    // POST /colleges — create from (at minimum) a name, mark caller-supplied fields as userEdited so
    // auto-hydration never overwrites them, then kick off hydration. Returns the created college
    // (already hydrated when the dispatcher is inline; still 'in-progress' when it's async).
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const data = getData();
      const dup = findActiveByName(await data.colleges.list(), input.name);
      if (dup) {
        throw Errors.conflict(`"${dup.name}" is already in your college list (id ${dup.collegeId}).`);
      }
      const userEdited = Object.keys(input); // everything the user typed is theirs to keep
      const created = await data.colleges.create({
        ...input,
        status: input.status ?? 'researching',
        addedBy: 'manual',
        userEdited,
        hydrationStatus: 'in-progress',
        assetsStatus: 'in-progress',
      } as Parameters<Data['colleges']['create']>[0]);
      // Text hydration and imagery fetch run on separate queues/workers — kicked off together.
      await dispatch(created.collegeId);
      await assetsDispatch(created.collegeId);
      const after = await data.colleges.get(created.collegeId);
      return { status: 201, body: after ?? created };
    },

    // PUT /colleges/:id — edit; the hydratable repo records changed fields in userEdited[].
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      await requireCollege(id);
      const updated = await getData().colleges.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /colleges/:id — soft delete: status → removed (restorable via PUT). Returns the college.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await requireCollege(id);
      const removed = await getData().colleges.update(id, { status: 'removed' });
      return { status: 200, body: removed };
    },

    // PATCH /colleges/:id/top-pick.
    topPick: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const { isTopPick } = validateBody(topPickSchema, ctx);
      await requireCollege(id);
      const updated = await getData().colleges.update(id, { isTopPick });
      return { status: 200, body: updated };
    },

    // POST /colleges/:id/hydrate — (re)hydrate one college. 202; poll GET /colleges/:id for status.
    hydrate: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      await requireCollege(id);
      await data.colleges.update(id, { hydrationStatus: 'in-progress' });
      // assetsStatus is system-owned — set it via merge (not update) so it's never marked userEdited.
      await data.colleges.mergePreservingUserEdits(id, { assetsStatus: 'in-progress' });
      await dispatch(id);
      await assetsDispatch(id);
      const after = await data.colleges.get(id);
      return { status: 202, body: after };
    },

    // POST /colleges/hydrate-all — refresh every non-removed college (text + imagery). 202 with a count.
    hydrateAll: async (ctx) => {
      void ctx;
      const data = getData();
      const targets = (await data.colleges.list()).filter((c) => c.status !== 'removed');
      for (const c of targets) {
        await data.colleges.update(c.collegeId, { hydrationStatus: 'in-progress' });
        await data.colleges.mergePreservingUserEdits(c.collegeId, { assetsStatus: 'in-progress' });
        await dispatch(c.collegeId);
        await assetsDispatch(c.collegeId);
      }
      return { status: 202, body: { requested: targets.length } };
    },

    // POST /colleges/assets-backfill — one-time: fetch imagery for every non-removed college that
    // doesn't have a campus photo yet. 202 with the count enqueued.
    assetsBackfill: async (ctx) => {
      void ctx;
      const data = getData();
      const targets = (await data.colleges.list()).filter(
        (c) => c.status !== 'removed' && !c.campusImageUrl,
      );
      for (const c of targets) {
        await data.colleges.mergePreservingUserEdits(c.collegeId, { assetsStatus: 'in-progress' });
        await assetsDispatch(c.collegeId);
      }
      return { status: 202, body: { requested: targets.length } };
    },

    // POST /colleges/discover — start an ASYNC discovery job and return its id. Web-grounded
    // discovery can exceed the 30s API budget, so the job runs on the SQS worker; the frontend polls
    // GET /colleges/discover/:jobId. (In tests/local with no queue, the job runs inline.)
    discover: async (ctx) => {
      const input = validateBody(discoverSchema, ctx);
      const job = await getData().discoveryJobs.create({ status: 'pending', filters: input });
      await discoverDispatch(job.jobId);
      // Re-read so an inline run (tests) returns the finished result; async returns the pending job.
      const after = await getData().discoveryJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /colleges/discover/:jobId — poll a discovery job's status + candidates.
    discoverStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().discoveryJobs.get(jobId);
      if (!job) throw Errors.notFound('Discovery job not found');
      return { status: 200, body: job };
    },

    // POST /colleges/bulk-add — add several discovered colleges at once (no auto-hydrate; they carry
    // discovery data already and can be refreshed later).
    bulkAdd: async (ctx) => {
      const { colleges } = validateBody(bulkAddSchema, ctx);
      const data = getData();
      // Dedupe against what's already tracked AND within the batch (normalized name).
      const seen = new Set((await data.colleges.list()).filter((c) => c.status !== 'removed').map((c) => normalizeCollegeName(c.name)));
      const created: College[] = [];
      const skipped: string[] = [];
      for (const c of colleges) {
        const key = normalizeCollegeName(c.name);
        if (seen.has(key)) {
          skipped.push(c.name);
          continue;
        }
        seen.add(key);
        created.push(
          await data.colleges.create({
            ...c,
            status: c.status ?? 'researching',
            addedBy: 'ai-discovered',
            hydrationStatus: 'partial',
          } as Parameters<Data['colleges']['create']>[0]),
        );
      }
      return { status: 201, body: { created, skipped } };
    },

    // GET /colleges/:id/notes.
    listNotes: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await requireCollege(id);
      const notes = await getData().collegeNotes.list(id);
      return { status: 200, body: { notes } };
    },

    // POST /colleges/:id/notes — author is always the JWT identity, never client-supplied.
    addNote: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const input = validateBody(noteSchema, ctx);
      const data = getData();
      await requireCollege(id);
      const note = await data.collegeNotes.add(id, {
        author: ctx.requester.username,
        content: input.content,
        noteType: input.noteType,
      });
      return { status: 201, body: note };
    },

    // GET /colleges/:id/checklist — the checklist (empty shell if none saved yet).
    getChecklist: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      await requireCollege(id);
      const checklist = await getData().collegeChecklist.get(id);
      return { status: 200, body: checklist ?? { collegeId: id, items: [] } };
    },

    // PUT /colleges/:id/checklist — replace the whole checklist.
    putChecklist: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const { items } = validateBody(checklistSchema, ctx);
      await requireCollege(id);
      const checklist = await getData().collegeChecklist.put(id, items);
      return { status: 200, body: checklist };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments are listed before the `:id` routes; the router also prefers higher static specificity. */
export function buildRoutes(h: CollegeHandlers) {
  return [
    { method: 'GET' as const, path: '/colleges', handler: h.list },
    { method: 'POST' as const, path: '/colleges', handler: h.create },
    { method: 'POST' as const, path: '/colleges/discover', handler: h.discover },
    { method: 'GET' as const, path: '/colleges/discover/:jobId', handler: h.discoverStatus },
    { method: 'POST' as const, path: '/colleges/hydrate-all', handler: h.hydrateAll },
    { method: 'POST' as const, path: '/colleges/assets-backfill', handler: h.assetsBackfill },
    { method: 'POST' as const, path: '/colleges/bulk-add', handler: h.bulkAdd },
    { method: 'GET' as const, path: '/colleges/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/colleges/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/colleges/:id', handler: h.remove },
    { method: 'PATCH' as const, path: '/colleges/:id/top-pick', handler: h.topPick },
    { method: 'POST' as const, path: '/colleges/:id/hydrate', handler: h.hydrate },
    { method: 'GET' as const, path: '/colleges/:id/notes', handler: h.listNotes },
    { method: 'POST' as const, path: '/colleges/:id/notes', handler: h.addNote },
    { method: 'GET' as const, path: '/colleges/:id/checklist', handler: h.getChecklist },
    { method: 'PUT' as const, path: '/colleges/:id/checklist', handler: h.putChecklist },
  ];
}

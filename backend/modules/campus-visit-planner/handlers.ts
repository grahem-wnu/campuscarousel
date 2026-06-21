// Campus Visit Planner handlers. Visits are family-visible sub-entities under COLLEGE#<id> — every
// authenticated caller may read and write them, so there is no visibility filtering here. Handlers
// are built from `getData` + an injectable AI seam (`prep`) so tests run fully offline (curated
// implementation) and production injects the Bedrock-backed one (see routes.manifest.ts).

import { Errors, validateBody, validateParams, type Handler, type RouteDef } from '../../shared/api/index.js';
import type { College, Data, Visit } from '../../shared/data/index.js';
import { packsForMajors } from '../../shared/packs/index.js';
import { curatedPrep, type PrepGenerator } from './prep.js';

/** The active student's intended major(s), for resolving their major pack's visit questions. */
async function activeMajors(data: Data): Promise<string[]> {
  try {
    return (await data.studentProfile.get())?.intendedMajors ?? [];
  } catch {
    return [];
  }
}
import {
  collegeParamSchema,
  createSchema,
  updateSchema,
  visitParamSchema,
} from './schema.js';

export interface VisitHandlers {
  list: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  prep: Handler;
}

export interface HandlerDeps {
  getData: () => Data;
  /** Visit-prep generator (defaults to the offline curated one). */
  prep?: PrepGenerator;
}

/** Ensure the parent college exists; 404 otherwise. Returns it for reuse. */
async function requireCollege(data: Data, collegeId: string) {
  const college = await data.colleges.get(collegeId);
  if (!college) throw Errors.notFound('College not found');
  return college;
}

export function makeHandlers(deps: HandlerDeps): VisitHandlers {
  const { getData } = deps;
  const prep = deps.prep ?? curatedPrep;

  /** Generate prep (model/curated best-time + questions + the student's major-pack questions and the
   *  college's logistics) and cache it on the visit. Returns the updated visit. */
  async function attachPrep(data: Data, college: College, visit: Visit): Promise<Visit> {
    const majors = await activeMajors(data);
    const result = await prep({ college, visit, majors });
    // Lead with the student's major-pack visit questions, then the standard checklist; dedupe.
    const packQuestions = packsForMajors(majors).flatMap((p) => p.visitQuestions ?? []);
    const questions = [...packQuestions, ...result.questions].filter((qn, i, arr) => arr.indexOf(qn) === i);
    return data.visits.update(visit.collegeId, visit.visitId, {
      prep: { bestTime: result.bestTime, questions, logistics: result.logistics, source: result.source, generatedAt: new Date().toISOString() },
    });
  }

  return {
    // GET /colleges/:id/visits
    list: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const data = getData();
      await requireCollege(data, id);
      const visits = await data.visits.list(id);
      return { status: 200, body: { visits } };
    },

    // POST /colleges/:id/visits — createdBy is stamped from the JWT, never the client. Prep is
    // generated and cached on the visit at save time (best-effort; a prep failure never fails create).
    create: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validateBody(createSchema, ctx);
      const data = getData();
      const college = await requireCollege(data, id);
      const created = await data.visits.add(id, { ...input, createdBy: ctx.requester.username });
      const withPrep = await attachPrep(data, college, created).catch(() => created);
      return { status: 201, body: withPrep };
    },

    // PUT /colleges/:id/visits/:vid — e.g. the post-visit debrief. Regenerate prep only when a field
    // it depends on (date / visit type) changed, so editing impressions etc. doesn't re-run the AI.
    update: async (ctx) => {
      const { id, vid } = validateParams(visitParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.visits.get(id, vid);
      if (!existing) throw Errors.notFound('Visit not found');
      const updated = await data.visits.update(id, vid, patch);
      const prepStale =
        (patch.date !== undefined && patch.date !== existing.date) ||
        (patch.visitType !== undefined && patch.visitType !== existing.visitType);
      if (!prepStale) return { status: 200, body: updated };
      const college = await requireCollege(data, id);
      const refreshed = await attachPrep(data, college, updated).catch(() => updated);
      return { status: 200, body: refreshed };
    },

    // DELETE /colleges/:id/visits/:vid
    remove: async (ctx) => {
      const { id, vid } = validateParams(visitParamSchema, ctx);
      const data = getData();
      const existing = await data.visits.get(id, vid);
      if (!existing) throw Errors.notFound('Visit not found');
      await data.visits.delete(id, vid);
      return { status: 204, body: undefined };
    },

    // POST /colleges/:id/visits/:vid/prep — explicit "Regenerate prep": re-run the AI/curated prep
    // and cache it on the visit. Returns the updated visit (with the fresh `prep`).
    prep: async (ctx) => {
      const { id, vid } = validateParams(visitParamSchema, ctx);
      const data = getData();
      const college = await requireCollege(data, id);
      const visit = await data.visits.get(id, vid);
      if (!visit) throw Errors.notFound('Visit not found');
      const refreshed = await attachPrep(data, college, visit);
      return { status: 200, body: refreshed };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test, so
 * there is one source of truth for paths. The deeper `/colleges/:id/visits/:vid/prep` is listed
 * before shallower param routes; the router also prefers more-specific (static-heavy, longer) paths,
 * so they never collide.
 */
export function buildRoutes(h: VisitHandlers): RouteDef[] {
  return [
    { method: 'POST', path: '/colleges/:id/visits/:vid/prep', handler: h.prep },
    { method: 'GET', path: '/colleges/:id/visits', handler: h.list },
    { method: 'POST', path: '/colleges/:id/visits', handler: h.create },
    { method: 'PUT', path: '/colleges/:id/visits/:vid', handler: h.update },
    { method: 'DELETE', path: '/colleges/:id/visits/:vid', handler: h.remove },
  ];
}

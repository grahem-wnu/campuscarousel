// Campus Visit Planner handlers. Visits are family-visible sub-entities under COLLEGE#<id> — every
// authenticated caller may read and write them, so there is no visibility filtering here. Handlers
// are built from `getData` + injectable AI seams (`prep`, `tripPlanner`) so tests run fully offline
// (curated implementations) and production injects the Bedrock-backed ones (see routes.manifest.ts).

import { Errors, validate, validateBody, validateParams, type Handler, type RouteDef } from '../../shared/api/index.js';
import type { Data } from '../../shared/data/index.js';
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
import { curatedTripPlan, type TripPlanner } from './tripplan.js';
import {
  collegeParamSchema,
  createSchema,
  tripPlanSchema,
  updateSchema,
  visitParamSchema,
} from './schema.js';

export interface VisitHandlers {
  list: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  prep: Handler;
  tripPlan: Handler;
}

export interface HandlerDeps {
  getData: () => Data;
  /** Visit-prep generator (defaults to the offline curated one). */
  prep?: PrepGenerator;
  /** Trip planner (defaults to the offline curated one). */
  tripPlanner?: TripPlanner;
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
  const tripPlanner = deps.tripPlanner ?? curatedTripPlan;

  return {
    // GET /colleges/:id/visits
    list: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const data = getData();
      await requireCollege(data, id);
      const visits = await data.visits.list(id);
      return { status: 200, body: { visits } };
    },

    // POST /colleges/:id/visits — createdBy is stamped from the JWT, never the client.
    create: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validateBody(createSchema, ctx);
      const data = getData();
      await requireCollege(data, id);
      const created = await data.visits.add(id, { ...input, createdBy: ctx.requester.username });
      return { status: 201, body: created };
    },

    // PUT /colleges/:id/visits/:vid — e.g. the post-visit debrief.
    update: async (ctx) => {
      const { id, vid } = validateParams(visitParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.visits.get(id, vid);
      if (!existing) throw Errors.notFound('Visit not found');
      const updated = await data.visits.update(id, vid, patch);
      return { status: 200, body: updated };
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

    // POST /colleges/:id/visits/:vid/prep — AI (or curated) program-specific visit prep.
    prep: async (ctx) => {
      const { id, vid } = validateParams(visitParamSchema, ctx);
      const data = getData();
      const college = await requireCollege(data, id);
      const visit = await data.visits.get(id, vid);
      if (!visit) throw Errors.notFound('Visit not found');
      const majors = await activeMajors(data);
      const result = await prep({ college, visit, majors });
      // Lead with the student's major-pack visit questions (e.g. nursing → NCLEX pass rate, clinical
      // sites), then the standard checklist; dedupe so the AI/curated overlap doesn't repeat.
      const packQuestions = packsForMajors(majors).flatMap((p) => p.visitQuestions ?? []);
      const questions = [...packQuestions, ...result.questions].filter((qn, i, arr) => arr.indexOf(qn) === i);
      return { status: 200, body: { ...result, questions } };
    },

    // POST /visits/trip-plan — group nearby schools into itineraries (AI or curated clustering).
    tripPlan: async (ctx) => {
      const input = validate(tripPlanSchema, ctx.body ?? {});
      const data = getData();
      const all = await data.colleges.list();
      const subset = input.collegeIds
        ? all.filter((c) => input.collegeIds!.includes(c.collegeId))
        : all;
      const plan = await tripPlanner(subset, input.maxClusters);
      return { status: 200, body: plan };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test, so
 * there is one source of truth for paths. The static `/visits/trip-plan` and the deeper
 * `/colleges/:id/visits/:vid/prep` are listed before shallower param routes; the router also prefers
 * more-specific (static-heavy, longer) paths, so they never collide.
 */
export function buildRoutes(h: VisitHandlers): RouteDef[] {
  return [
    { method: 'POST', path: '/visits/trip-plan', handler: h.tripPlan },
    { method: 'POST', path: '/colleges/:id/visits/:vid/prep', handler: h.prep },
    { method: 'GET', path: '/colleges/:id/visits', handler: h.list },
    { method: 'POST', path: '/colleges/:id/visits', handler: h.create },
    { method: 'PUT', path: '/colleges/:id/visits/:vid', handler: h.update },
    { method: 'DELETE', path: '/colleges/:id/visits/:vid', handler: h.remove },
  ];
}

// Demonstrated Interest + Contact Network handlers. Everything here is FAMILY-VISIBLE
// (specs/modules/demonstrated-interest-contacts.md "Privacy") — there is no `private` state, so any
// authenticated family member may read and write. Identity still comes from the JWT: a touchpoint's
// `createdBy` is recorded server-side, never trusted from the body, and the recommender-brief AI
// reads only the caller-visible slice of Keira's data. Handlers are built from `getData` /
// `getBriefer` thunks so tests inject fakes and production injects the live client + Bedrock briefer.

import {
  Errors,
  validate,
  validateBody,
  validateParams,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import { filterForRequester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import type { Briefer } from './briefs.js';
import { coverageGaps, groupRecommenders, isPendingFollowUp, sortFollowUps } from './logic.js';
import {
  briefSchema,
  collegeParamSchema,
  contactCreateSchema,
  contactParamSchema,
  contactUpdateSchema,
  touchpointCreateSchema,
  touchpointParamSchema,
  touchpointUpdateSchema,
} from './schema.js';

export interface DicHandlers {
  listTouchpoints: Handler;
  createTouchpoint: Handler;
  updateTouchpoint: Handler;
  deleteTouchpoint: Handler;
  followUps: Handler;
  listContacts: Handler;
  createContact: Handler;
  getContact: Handler;
  updateContact: Handler;
  deleteContact: Handler;
  recommenders: Handler;
  recommenderBrief: Handler;
}

export function makeHandlers(getData: () => Data, getBriefer: () => Briefer): DicHandlers {
  async function requireCollege(id: string): Promise<void> {
    if (!(await getData().colleges.get(id))) throw Errors.notFound('College not found');
  }

  return {
    // GET /colleges/:id/touchpoints — chronological interaction log for one college.
    listTouchpoints: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      await requireCollege(id);
      const touchpoints = await getData().touchpoints.list(id);
      return { status: 200, body: { touchpoints } };
    },

    // POST /colleges/:id/touchpoints — log an interaction (creator recorded from the JWT).
    createTouchpoint: async (ctx) => {
      const { id } = validateParams(collegeParamSchema, ctx);
      const input = validateBody(touchpointCreateSchema, ctx);
      await requireCollege(id);
      const created = await getData().touchpoints.add(id, { ...input, createdBy: ctx.requester.username });
      return { status: 201, body: created };
    },

    // PUT /colleges/:id/touchpoints/:tid — update an interaction.
    updateTouchpoint: async (ctx) => {
      const { id, tid } = validateParams(touchpointParamSchema, ctx);
      const patch = validateBody(touchpointUpdateSchema, ctx);
      const data = getData();
      if (!(await data.touchpoints.get(id, tid))) throw Errors.notFound('Touchpoint not found');
      const updated = await data.touchpoints.update(id, tid, patch);
      return { status: 200, body: updated };
    },

    // DELETE /colleges/:id/touchpoints/:tid.
    deleteTouchpoint: async (ctx) => {
      const { id, tid } = validateParams(touchpointParamSchema, ctx);
      const data = getData();
      if (!(await data.touchpoints.get(id, tid))) throw Errors.notFound('Touchpoint not found');
      await data.touchpoints.delete(id, tid);
      return { status: 204, body: undefined };
    },

    // GET /touchpoints/follow-ups — every pending follow-up across all colleges, soonest first.
    followUps: async (ctx) => {
      void ctx;
      const data = getData();
      const colleges = await data.colleges.list();
      const perCollege = await Promise.all(
        colleges.map(async (c) => {
          const tps = await data.touchpoints.list(c.collegeId);
          return tps
            .filter(isPendingFollowUp)
            .map((t) => ({ ...t, collegeName: c.name }));
        }),
      );
      const followUps = sortFollowUps(perCollege.flat());
      return { status: 200, body: { followUps } };
    },

    // GET /contacts — the whole rolodex (filtering happens client-side).
    listContacts: async () => {
      const contacts = await getData().contacts.list();
      return { status: 200, body: { contacts } };
    },

    // POST /contacts.
    createContact: async (ctx) => {
      const input = validateBody(contactCreateSchema, ctx);
      const created = await getData().contacts.create(input);
      return { status: 201, body: created };
    },

    // GET /contacts/:id.
    getContact: async (ctx) => {
      const { id } = validateParams(contactParamSchema, ctx);
      const contact = await getData().contacts.get(id);
      if (!contact) throw Errors.notFound('Contact not found');
      return { status: 200, body: contact };
    },

    // PUT /contacts/:id.
    updateContact: async (ctx) => {
      const { id } = validateParams(contactParamSchema, ctx);
      const patch = validateBody(contactUpdateSchema, ctx);
      const data = getData();
      if (!(await data.contacts.get(id))) throw Errors.notFound('Contact not found');
      const updated = await data.contacts.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /contacts/:id.
    deleteContact: async (ctx) => {
      const { id } = validateParams(contactParamSchema, ctx);
      const data = getData();
      if (!(await data.contacts.get(id))) throw Errors.notFound('Contact not found');
      await data.contacts.delete(id);
      return { status: 204, body: undefined };
    },

    // GET /contacts/recommenders — potential recommenders grouped by slot, with coverage gaps.
    recommenders: async () => {
      const contacts = await getData().contacts.list();
      return { status: 200, body: { groups: groupRecommenders(contacts), gaps: coverageGaps(contacts) } };
    },

    // POST /contacts/:id/recommender-brief — AI one-page brief from the caller-visible data.
    recommenderBrief: async (ctx) => {
      const { id } = validateParams(contactParamSchema, ctx);
      const input = validate(briefSchema, ctx.body ?? {});
      const data = getData();
      const contact = await data.contacts.get(id);
      if (!contact) throw Errors.notFound('Contact not found');
      const [activitiesRaw, goals] = await Promise.all([data.activities.list(), data.goals.list()]);
      const activities = filterForRequester(activitiesRaw, ctx.requester);
      const brief = await getBriefer().brief(contact, { activities, goals }, input.focus);
      return { status: 200, body: { contactId: id, brief } };
    },
  };
}

/**
 * The module's route table. Static collection routes (`/contacts/recommenders`,
 * `/touchpoints/follow-ups`) precede the `:id` routes; the router also prefers static segments, so
 * they never collide. The nested `/colleges/:id/touchpoints[...]` paths don't collide with
 * college-hub's `/colleges/:id` or peer-benchmark's `/colleges/:id/benchmark`.
 */
export function buildRoutes(h: DicHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/colleges/:id/touchpoints', handler: h.listTouchpoints },
    { method: 'POST', path: '/colleges/:id/touchpoints', handler: h.createTouchpoint },
    { method: 'PUT', path: '/colleges/:id/touchpoints/:tid', handler: h.updateTouchpoint },
    { method: 'DELETE', path: '/colleges/:id/touchpoints/:tid', handler: h.deleteTouchpoint },
    { method: 'GET', path: '/touchpoints/follow-ups', handler: h.followUps },
    { method: 'GET', path: '/contacts/recommenders', handler: h.recommenders },
    { method: 'GET', path: '/contacts', handler: h.listContacts },
    { method: 'POST', path: '/contacts', handler: h.createContact },
    { method: 'POST', path: '/contacts/:id/recommender-brief', handler: h.recommenderBrief },
    { method: 'GET', path: '/contacts/:id', handler: h.getContact },
    { method: 'PUT', path: '/contacts/:id', handler: h.updateContact },
    { method: 'DELETE', path: '/contacts/:id', handler: h.deleteContact },
  ];
}

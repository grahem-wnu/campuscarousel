// Master Timeline handlers — read-only aggregation of every dated item across modules into one
// stream. PRIVACY: activity-derived events are visibility-filtered (filterForRequester off the JWT)
// BEFORE aggregation, so a parent/admin never sees an event sourced from keira's private journal
// entries; keira sees everything. Built from injectable deps (in-memory data + pinned clock + stub
// analyzer in tests).

import { validateBody, validateQuery, type Handler } from '../../shared/api/index.js';
import { filterForRequester } from '../../shared/auth/index.js';
import type { Data, Visit } from '../../shared/data/index.js';
import { analyzeSchema, timelineQuerySchema, upcomingQuerySchema } from './schema.js';
import { buildEvents, filterEvents, upcoming, type EventSources } from './events.js';
import { makeBedrockAnalyzer, type Analyzer } from './ai.js';

const DEFAULT_HORIZON = 90;

export interface TimelineHandlers {
  timeline: Handler;
  upcoming: Handler;
  analyze: Handler;
}
export interface TimelineDeps {
  getData: () => Data;
  analyzer?: Analyzer;
  now?: () => Date;
}

export function makeHandlers(deps: TimelineDeps): TimelineHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const analyzer = deps.analyzer ?? makeBedrockAnalyzer();
  const today = (): string => now().toISOString().slice(0, 10);

  // Gather all event sources, visibility-filtering activities for the caller.
  async function gather(requester: Parameters<Handler>[0]['requester']): Promise<EventSources> {
    const data = getData();
    const [activitiesRaw, goals, colleges, teas, scholarships, certifications, finaid] = await Promise.all([
      data.activities.list(),
      data.goals.list(),
      data.colleges.list(),
      data.teas.list(),
      data.scholarships.list(),
      data.certifications.list(),
      data.finaid.list(),
    ]);
    // Visits are sub-entities under COLLEGE#<id> — list per college and flatten.
    const visitLists = await Promise.all(colleges.map((c) => data.visits.list(c.collegeId)));
    const visits: Visit[] = visitLists.flat();
    return {
      activities: filterForRequester(activitiesRaw, requester), // PRIVACY
      goals,
      colleges,
      teas,
      visits,
      scholarships,
      certifications,
      finaid,
    };
  }

  return {
    // GET /timeline — the unified, filtered event stream.
    timeline: async (ctx) => {
      const q = validateQuery(timelineQuerySchema, ctx);
      const events = filterEvents(buildEvents(await gather(ctx.requester)), q);
      return { status: 200, body: { events } };
    },

    // GET /timeline/upcoming — overdue + next-N-days, prioritized (overdue first, then soonest).
    upcoming: async (ctx) => {
      const q = validateQuery(upcomingQuerySchema, ctx);
      const horizon = q.horizon ?? DEFAULT_HORIZON;
      const events = upcoming(buildEvents(await gather(ctx.requester)), today(), horizon);
      return { status: 200, body: { events, horizon } };
    },

    // POST /timeline/analyze — AI priorities, conflicts, and missing items over the window.
    analyze: async (ctx) => {
      const body = validateBody(analyzeSchema, ctx);
      const all = buildEvents(await gather(ctx.requester));
      const todayIso = today();
      const window = upcoming(all, todayIso, body.horizonDays ?? DEFAULT_HORIZON);
      const analysis = await analyzer({ events: window, allEvents: all, todayIso });
      return { status: 200, body: { analysis } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede any others; here all paths are static so ordering is purely cosmetic. */
export function buildRoutes(h: TimelineHandlers) {
  return [
    { method: 'GET' as const, path: '/timeline/upcoming', handler: h.upcoming },
    { method: 'POST' as const, path: '/timeline/analyze', handler: h.analyze },
    { method: 'GET' as const, path: '/timeline', handler: h.timeline },
  ];
}

// Master Timeline handlers — read-only aggregation of every dated DEADLINE/milestone across modules
// into one stream. Journal entries (activities) are intentionally NOT included — the timeline is for
// what's due (deadlines, exam/visit dates, goal targets), not the activity log. Because no
// visibility-bearing source is aggregated here, there's nothing to per-caller privacy-filter. Built
// from injectable deps (in-memory data + pinned clock + stub analyzer in tests).

import { validateBody, validateQuery, type Handler } from '../../shared/api/index.js';
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

  /** Read the active student's profile (major + grad year) so the planning coach reflects their focus
   *  and grade. Defensive: a read failure degrades to no profile rather than a 500. */
  async function activeProfile() {
    try {
      return await getData().studentProfile.get();
    } catch {
      return null;
    }
  }

  // Gather the timeline's deadline/milestone sources. Activities (journal entries) are deliberately
  // excluded — see the file header.
  async function gather(): Promise<EventSources> {
    const data = getData();
    const [goals, colleges, exams, scholarships, certifications, finaid, profile] = await Promise.all([
      data.goals.list(),
      data.colleges.list(),
      data.exams.list(),
      data.scholarships.list(),
      data.certifications.list(),
      data.finaid.list(),
      data.studentProfile.get(),
    ]);
    // Visits are sub-entities under COLLEGE#<id> — list per college and flatten.
    const visitLists = await Promise.all(colleges.map((c) => data.visits.list(c.collegeId)));
    const visits: Visit[] = visitLists.flat();
    return {
      activities: [], // journal entries are not timeline events
      goals,
      colleges,
      exams,
      visits,
      scholarships,
      certifications,
      finaid,
      graduationYear: profile?.graduationYear,
    };
  }

  return {
    // GET /timeline — the unified, filtered event stream.
    timeline: async (ctx) => {
      const q = validateQuery(timelineQuerySchema, ctx);
      const events = filterEvents(buildEvents(await gather()), q);
      return { status: 200, body: { events } };
    },

    // GET /timeline/upcoming — overdue + next-N-days, prioritized (overdue first, then soonest).
    upcoming: async (ctx) => {
      const q = validateQuery(upcomingQuerySchema, ctx);
      const horizon = q.horizon ?? DEFAULT_HORIZON;
      const events = upcoming(buildEvents(await gather()), today(), horizon);
      return { status: 200, body: { events, horizon } };
    },

    // POST /timeline/analyze — AI priorities, conflicts, and missing items over the window.
    analyze: async (ctx) => {
      const body = validateBody(analyzeSchema, ctx);
      const all = buildEvents(await gather());
      const todayIso = today();
      const window = upcoming(all, todayIso, body.horizonDays ?? DEFAULT_HORIZON);
      const profile = await activeProfile();
      const analysis = await analyzer({
        events: window,
        allEvents: all,
        todayIso,
        majors: profile?.intendedMajors ?? [],
        graduationYear: profile?.graduationYear,
      });
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

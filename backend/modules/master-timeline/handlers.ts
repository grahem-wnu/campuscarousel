// Master Timeline handlers — read-only aggregation of every dated DEADLINE/milestone across modules
// into one stream. Journal entries (activities) are intentionally NOT included — the timeline is for
// what's due (deadlines, exam/visit dates, goal targets), not the activity log. Because no
// visibility-bearing source is aggregated here, there's nothing to per-caller privacy-filter. Built
// from injectable deps (in-memory data + pinned clock + stub analyzer in tests).

import { validateBody, validateQuery, type Handler } from '../../shared/api/index.js';
import type { Data, Visit } from '../../shared/data/index.js';
import { analyzeSchema, dismissSchema, timelineQuerySchema, upcomingQuerySchema } from './schema.js';
import { buildEvents, filterEvents, upcoming, type EventSources, type TimelineEvent } from './events.js';
import { makeBedrockAnalyzer, type Analyzer } from './ai.js';

const DEFAULT_HORIZON = 90;

export interface TimelineHandlers {
  timeline: Handler;
  upcoming: Handler;
  analyze: Handler;
  dismiss: Handler;
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

  /** Event ids the family has removed from the timeline. Defensive: never blocks the read. */
  async function dismissedIds(): Promise<Set<string>> {
    try {
      return new Set(await getData().timelineDismissals.list());
    } catch {
      return new Set();
    }
  }

  /** Drop dismissed events from a built list (no-op when nothing is dismissed). */
  const dropDismissed = <T extends TimelineEvent>(events: T[], dismissed: Set<string>): T[] =>
    dismissed.size ? events.filter((e) => !dismissed.has(e.id)) : events;

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
    // Visits are sub-entities under COLLEGE#<id> — list per college (all colleges) and flatten.
    const visitLists = await Promise.all(colleges.map((c) => data.visits.list(c.collegeId)));
    const visits: Visit[] = visitLists.flat();
    return {
      activities: [], // journal entries are not timeline events
      goals,
      // Opt-in: only TOP PICKS put their application deadlines on the timeline. (Visits above are
      // kept for every college — a planned visit shows regardless of pick status.)
      colleges: colleges.filter((c) => c.isTopPick),
      exams,
      visits,
      scholarships,
      certifications,
      finaid,
      graduationYear: profile?.graduationYear,
    };
  }

  return {
    // GET /timeline — the unified, filtered event stream (dismissed events removed).
    timeline: async (ctx) => {
      const q = validateQuery(timelineQuerySchema, ctx);
      const events = filterEvents(dropDismissed(buildEvents(await gather()), await dismissedIds()), q);
      return { status: 200, body: { events } };
    },

    // GET /timeline/upcoming — overdue + next-N-days, prioritized (overdue first, then soonest).
    upcoming: async (ctx) => {
      const q = validateQuery(upcomingQuerySchema, ctx);
      const horizon = q.horizon ?? DEFAULT_HORIZON;
      const events = upcoming(dropDismissed(buildEvents(await gather()), await dismissedIds()), today(), horizon);
      return { status: 200, body: { events, horizon } };
    },

    // POST /timeline/analyze — AI priorities, conflicts, and missing items over the window.
    analyze: async (ctx) => {
      const body = validateBody(analyzeSchema, ctx);
      const all = dropDismissed(buildEvents(await gather()), await dismissedIds());
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

    // POST /timeline/dismiss — remove a derived event from the timeline by id. Records the id (the
    // event has no row of its own) so every read path filters it out; the source record is untouched.
    dismiss: async (ctx) => {
      const { eventId } = validateBody(dismissSchema, ctx);
      await getData().timelineDismissals.add(eventId);
      return { status: 204, body: undefined };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede any others; here all paths are static so ordering is purely cosmetic. */
export function buildRoutes(h: TimelineHandlers) {
  return [
    { method: 'GET' as const, path: '/timeline/upcoming', handler: h.upcoming },
    { method: 'POST' as const, path: '/timeline/analyze', handler: h.analyze },
    { method: 'POST' as const, path: '/timeline/dismiss', handler: h.dismiss },
    { method: 'GET' as const, path: '/timeline', handler: h.timeline },
  ];
}

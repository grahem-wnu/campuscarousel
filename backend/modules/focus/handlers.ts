// Focus handlers: the "major pack" page. GET /focus resolves the active student's intended major(s)
// into their pack(s) — the curated, instant content (entrance exam, certifications, interview/visit
// questions) — plus the cached web-grounded AI overview and its freshness. POST /focus/overview kicks
// off (or refreshes) that overview on the async worker (web search can't run on the 30s request path).
// Family-visible like the profile it reads; identity comes from the JWT and the router 401s anon callers.

import { Errors, type Handler } from '../../shared/api/index.js';
import type { Data, FocusOverview } from '../../shared/data/index.js';
import { packsForMajors, type MajorPack } from '../../shared/packs/index.js';
import { type OverviewDispatcher } from './overview.js';
import { type CareerDispatcher } from './careerpath.js';

export interface FocusHandlers {
  get: Handler;
  refresh: Handler;
  refreshCareer: Handler;
}

export interface FocusDeps {
  getData: () => Data;
  /** Enqueue (or inline-run) the web-grounded major-overview job. */
  overviewDispatch: OverviewDispatcher;
  /** Enqueue (or inline-run) the web-grounded career-path job. */
  careerDispatch: CareerDispatcher;
}

/** JSON-friendly view of one resolved major pack for the frontend. */
interface PackSummary {
  key: string;
  label: string;
  focusBrief: string;
  certifications: MajorPack['certifications'];
  entranceExam: MajorPack['entranceExam'];
  interviewQuestions: string[];
  visitQuestions: string[];
}

function toPackSummary(p: MajorPack): PackSummary {
  return {
    key: p.key,
    label: p.label,
    focusBrief: p.focusBrief,
    certifications: p.certifications ?? [],
    entranceExam: p.entranceExam,
    interviewQuestions: p.interviewQuestions ?? [],
    visitQuestions: p.visitQuestions ?? [],
  };
}

/** Same set membership, order-insensitive — used to tell if a cached overview is stale vs current majors. */
function sameMajors(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map((m) => m.trim().toLowerCase()));
  return b.every((m) => set.has(m.trim().toLowerCase()));
}

export function makeHandlers(deps: FocusDeps): FocusHandlers {
  const { getData, overviewDispatch, careerDispatch } = deps;

  return {
    // GET /focus — the resolved pack(s) + cached overview + career path + freshness for the student.
    get: async () => {
      const data = getData();
      const profile = await data.studentProfile.get();
      const majors = profile?.intendedMajors ?? [];
      const careerGoal = profile?.careerGoal ?? null;
      const packs = packsForMajors(majors).map(toPackSummary);
      const overview = await data.focusOverview.get();
      const stale = !!overview && !sameMajors(overview.generatedFor ?? [], majors);
      const careerPath = await data.careerPath.get();
      // The career path is stale once the career goal it was generated for no longer matches.
      const careerStale = !!careerPath && (careerPath.generatedFor ?? [])[0] !== (careerGoal ?? '');
      return {
        status: 200,
        body: {
          majors,
          careerGoal,
          packs,
          overview: overview ?? null,
          stale,
          careerPath: careerPath ?? null,
          careerStale,
        },
      };
    },

    // POST /focus/overview — (re)generate the web-grounded overview. Mark it pending immediately so the
    // page shows progress, then dispatch the async job; return 202 with the pending state.
    refresh: async () => {
      const data = getData();
      const majors = (await data.studentProfile.get())?.intendedMajors ?? [];
      const pending: FocusOverview = await data.focusOverview.put({ status: 'pending', generatedFor: majors });
      await overviewDispatch();
      // Re-read: an inline fallback (no queue) will already have completed it.
      const after = await data.focusOverview.get();
      return { status: 202, body: after ?? pending };
    },

    // POST /focus/career-path — (re)generate the web-grounded roadmap from the free-text career goal.
    // Requires a career goal (set on the profile); mark pending, dispatch the async job, return 202.
    refreshCareer: async () => {
      const data = getData();
      const careerGoal = (await data.studentProfile.get())?.careerGoal ?? '';
      if (!careerGoal.trim()) {
        throw Errors.validation('Set a career goal first (on the Family page) to generate a path.');
      }
      const pending: FocusOverview = await data.careerPath.put({ status: 'pending', generatedFor: [careerGoal] });
      await careerDispatch();
      const after = await data.careerPath.get();
      return { status: 202, body: after ?? pending };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments precede shallower ones; the router also prefers higher static specificity. */
export function buildRoutes(h: FocusHandlers) {
  return [
    { method: 'POST' as const, path: '/focus/overview', handler: h.refresh },
    { method: 'POST' as const, path: '/focus/career-path', handler: h.refreshCareer },
    { method: 'GET' as const, path: '/focus', handler: h.get },
  ];
}

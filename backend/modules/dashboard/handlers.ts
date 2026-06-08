// Dashboard handler — one read-only endpoint that rolls up the whole journey, role-specific and
// visibility-filtered. PRIVACY: activities + clinical hours are run through the shared
// filterForRequester before any aggregation, so a parent/admin never sees a stat or feed item derived
// from keira's `private` entries; keira sees everything. Built from injectable deps (in-memory data +
// pinned clock in tests).

import { type Handler } from '../../shared/api/index.js';
import { filterForRequester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import {
  activitySummary,
  budgetSummary,
  certSummary,
  clinicalTotalHours,
  collegeCounts,
  computeGpa,
  goalSummary,
  interviewReadiness,
  latestTeas,
  recentFeed,
  upcomingDeadlines,
} from './summary.js';

export interface DashboardHandlers {
  get: Handler;
}
export interface DashboardDeps {
  getData: () => Data;
  now?: () => Date;
}

export function makeHandlers(deps: DashboardDeps): DashboardHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    // GET /dashboard — the authenticated user's role-appropriate, visibility-filtered overview.
    get: async (ctx) => {
      const data = getData();
      const [courses, activitiesRaw, clinicalRaw, teas, certs, colleges, goals, scholarships, budget, interviews] =
        await Promise.all([
          data.courses.list(),
          data.activities.list(),
          data.clinical.list(),
          data.teas.list(),
          data.certifications.list(),
          data.colleges.list(),
          data.goals.list(),
          data.scholarships.list(),
          data.budget.get(),
          data.interviews.list(),
        ]);

      // PRIVACY: drop entries the caller may not see BEFORE aggregating.
      const activities = filterForRequester(activitiesRaw, ctx.requester);
      const clinical = filterForRequester(clinicalRaw, ctx.requester);
      const todayIso = now().toISOString().slice(0, 10);

      const deadlines = upcomingDeadlines({ colleges, goals, scholarships, certifications: certs }, todayIso);
      const teasLatest = latestTeas(teas);

      // Shown to everyone.
      const common = {
        gpa: computeGpa(courses),
        activity: activitySummary(activities, todayIso),
        clinicalHours: clinicalTotalHours(clinical),
        latestTeas: teasLatest,
        certifications: certSummary(certs, todayIso),
        upcomingDeadlines: deadlines,
        collegeCounts: collegeCounts(colleges),
        recentFeed: recentFeed(activities),
      };

      const role = ctx.requester.role;
      if (role === 'student') {
        const a = common.activity;
        return {
          status: 200,
          body: {
            role,
            ...common,
            student: {
              weeklyStreak: a.weeklyStreak,
              nextMilestone: deadlines[0] ?? null,
              motivationalStat: motivational(a.totalHours, common.clinicalHours, a.weeklyStreak),
              interviewReadiness: interviewReadiness(interviews),
            },
          },
        };
      }

      // admin / parent
      return {
        status: 200,
        body: {
          role,
          ...common,
          family: {
            budget: budgetSummary(budget, scholarships, colleges),
            goals: goalSummary(goals),
            benchmarkReadiness: benchmarkReadiness(common.gpa.weighted, teasLatest?.overallScore ?? null, common.clinicalHours),
          },
        },
      };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: DashboardHandlers) {
  return [{ method: 'GET' as const, path: '/dashboard', handler: h.get }];
}

/** A short, computed (not AI-generated) motivational line for the student view. */
function motivational(activityHours: number, clinicalHours: number, streak: number): string {
  if (streak >= 4) return `🔥 ${streak}-week streak — consistency is your superpower.`;
  if (clinicalHours >= 50) return `${clinicalHours} clinical hours logged — real patient time admissions love.`;
  if (activityHours + clinicalHours > 0) return `${Math.round(activityHours + clinicalHours)} hours invested in your nursing journey so far.`;
  return 'Log your first activity to start building your story.';
}

/** Coarse self-readiness from the student's own stats (per-college benchmarks live in peer-benchmark). */
function benchmarkReadiness(
  gpa: number | null,
  teas: number | null,
  clinicalHours: number,
): { level: 'strong' | 'competitive' | 'needs-work' | 'insufficient-data'; gpa: number | null; teas: number | null; clinicalHours: number } {
  if (gpa === null && teas === null && clinicalHours === 0) return { level: 'insufficient-data', gpa, teas, clinicalHours };
  let score = 0;
  if (gpa !== null) score += gpa >= 3.7 ? 2 : gpa >= 3.3 ? 1 : 0;
  if (teas !== null) score += teas >= 78 ? 2 : teas >= 65 ? 1 : 0;
  score += clinicalHours >= 75 ? 2 : clinicalHours >= 30 ? 1 : 0;
  const level = score >= 5 ? 'strong' : score >= 3 ? 'competitive' : 'needs-work';
  return { level, gpa, teas, clinicalHours };
}

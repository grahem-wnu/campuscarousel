// Conversational onboarding handlers. Two endpoints:
//   POST /onboarding/chat   — one model-only chat turn (interview + structured extraction).
//   POST /onboarding/finish — persist the gathered profile (onboardingComplete), then SEED the student:
//                             a few starter goals (model-only suggester) + an async college-discovery
//                             job for the intended major. Seeding is best-effort: a failure there never
//                             blocks finishing onboarding. Family-visible; identity from the JWT.

import { validateBody, type Handler } from '../../shared/api/index.js';
import type { Data, StudentProfile } from '../../shared/data/index.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';
import type { DiscoverDispatcher } from '../college-hub/discover.js';
import { chatSchema, finishSchema } from './schema.js';
import { type OnboardingChatter, type OnboardingProfile } from './ai.js';

export interface OnboardingHandlers {
  chat: Handler;
  finish: Handler;
}

export interface OnboardingDeps {
  getData: () => Data;
  chatter: OnboardingChatter;
  suggester: GoalSuggester;
  /** Enqueue (or inline-run) a college-discovery job. */
  discoverDispatch: DiscoverDispatcher;
}

/** Map the chat's gathered profile onto a StudentProfile patch (budgetTotal → budget object). */
function toProfilePatch(p: OnboardingProfile): Partial<StudentProfile> {
  const patch: Partial<StudentProfile> = { onboardingComplete: true };
  if (p.name) patch.name = p.name;
  if (p.highSchool) patch.highSchool = p.highSchool;
  if (p.location) patch.location = p.location;
  if (p.graduationYear != null) patch.graduationYear = p.graduationYear;
  if (p.currentGPA != null) patch.currentGPA = p.currentGPA;
  if (p.gpaType) patch.gpaType = p.gpaType;
  if (p.careerGoal) patch.careerGoal = p.careerGoal;
  if (p.intendedMajors && p.intendedMajors.length) patch.intendedMajors = p.intendedMajors;
  if (p.interests && p.interests.length) patch.interests = p.interests;
  if (p.budgetTotal != null) patch.budget = { total: p.budgetTotal, currency: 'USD' };
  return patch;
}

export function makeHandlers(deps: OnboardingDeps): OnboardingHandlers {
  const { getData, chatter, suggester, discoverDispatch } = deps;

  return {
    // POST /onboarding/chat — one conversational turn. Never 500s on a model hiccup; the chat keeps
    // flowing with a gentle fallback so a family is never stuck.
    chat: async (ctx) => {
      const { messages } = validateBody(chatSchema, ctx);
      try {
        const turn = await chatter(messages);
        return { status: 200, body: turn };
      } catch {
        return { status: 200, body: { reply: 'Sorry — I lost my train of thought. Could you say that once more?', profile: {}, done: false } };
      }
    },

    // POST /onboarding/finish — save the profile and seed the student.
    finish: async (ctx) => {
      const { profile } = validateBody(finishSchema, ctx);
      const data = getData();
      const existing = await data.studentProfile.get();
      const saved = await data.studentProfile.put({
        ...(existing ?? {}),
        ...toProfilePatch(profile),
        updatedBy: ctx.requester.username,
      });
      const majors = saved.intendedMajors ?? [];

      // Seed starter goals (best-effort, model-only).
      let goalsCreated = 0;
      try {
        const suggestions = await suggester.suggest(
          {
            careerGoal: saved.careerGoal,
            gradeLevel: saved.graduationYear ? `Class of ${saved.graduationYear}` : undefined,
            count: 3,
          },
          majors,
        );
        for (const s of suggestions.slice(0, 3)) {
          await data.goals.create({
            title: s.title,
            description: s.description,
            category: s.category,
            period: s.period,
            milestones: (s.milestones ?? []).map((label, i) => ({ id: `ms-${i}`, label, completed: false })),
            createdBy: ctx.requester.username,
          } as Parameters<Data['goals']['create']>[0]);
          goalsCreated++;
        }
      } catch {
        /* seeding is non-fatal — the family can add goals later */
      }

      // Kick off async college discovery for the major (best-effort).
      let discoveryJobId: string | undefined;
      try {
        const query = majors[0]
          ? `${majors[0]} programs`
          : saved.careerGoal
            ? `${saved.careerGoal} college programs`
            : undefined;
        const job = await data.discoveryJobs.create({ status: 'pending', filters: { query, limit: 6 } });
        await discoverDispatch(job.jobId);
        discoveryJobId = job.jobId;
      } catch {
        /* discovery is non-fatal — the family can run the College Finder later */
      }

      return { status: 200, body: { profile: saved, goalsCreated, discoveryJobId: discoveryJobId ?? null } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: OnboardingHandlers) {
  return [
    { method: 'POST' as const, path: '/onboarding/chat', handler: h.chat },
    { method: 'POST' as const, path: '/onboarding/finish', handler: h.finish },
  ];
}

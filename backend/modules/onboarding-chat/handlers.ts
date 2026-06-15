// Conversational onboarding handlers. Two endpoints:
//   POST /onboarding/chat   — one model-only chat turn (interview + structured extraction).
//   POST /onboarding/finish — persist the gathered profile (onboardingComplete), then ENQUEUE the
//                             student seeding (starter goals + college discovery + budget) so the
//                             family lands on the dashboard/tour immediately instead of waiting on a
//                             30-60s synchronous seed. The actual seeding runs on the async worker
//                             (see seed.ts). Family-visible; identity from the JWT.

import { Errors, validateBody, type Handler } from '../../shared/api/index.js';
import type { Data, StudentProfile } from '../../shared/data/index.js';
import { chatSchema, finishSchema } from './schema.js';
import { type OnboardingChatter, type OnboardingProfile } from './ai.js';
import type { SeedDispatcher } from './seed.js';

export interface OnboardingHandlers {
  chat: Handler;
  finish: Handler;
  reset: Handler;
}

export interface OnboardingDeps {
  getData: () => Data;
  chatter: OnboardingChatter;
  /** Enqueue (or inline-run) the post-onboarding seeding job. */
  seedDispatch: SeedDispatcher;
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
  const { getData, chatter, seedDispatch } = deps;

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

    // POST /onboarding/finish — save the profile, then ENQUEUE the (slow) seeding and return at once.
    // The seed (2 AI calls + ~12 colleges + their hydrate/asset dispatches) ran ~30-60s inline and
    // blew past the 30s request budget; backgrounding it lets the family hit the dashboard + tour
    // immediately while goals/colleges fill in. 202 = accepted, seeding in progress.
    finish: async (ctx) => {
      const { profile } = validateBody(finishSchema, ctx);
      const data = getData();
      const existing = await data.studentProfile.get();
      const saved = await data.studentProfile.put({
        ...(existing ?? {}),
        ...toProfilePatch(profile),
        updatedBy: ctx.requester.username,
      });
      // Best-effort dispatch — a queue hiccup must not fail finishing onboarding.
      try {
        await seedDispatch();
      } catch {
        /* the family can seed via College Finder / Goal Tracker if this never runs */
      }
      return { status: 202, body: { profile: saved, seeding: 'queued' } };
    },

    // POST /onboarding/reset — TESTING aid (admin only): reset the ACTIVE student's SETUP so onboarding
    // can be re-run, WITHOUT touching factual history. Clears the major + re-arms onboarding, deletes
    // the onboarding-built path (goals) and AI-discovered colleges. KEEPS GPA, courses, journal,
    // activities, exams, and manually-added colleges. Scoped to the active student via X-Student-Id.
    reset: async (ctx) => {
      if (ctx.requester.role !== 'admin') {
        throw Errors.forbidden('Only an admin can reset a student.');
      }
      const data = getData();
      // Re-arm onboarding + clear the major, but PRESERVE the rest of the profile (GPA, name, grad
      // year, career goal). put replaces, so spread the existing profile first.
      const existing = await data.studentProfile.get();
      await data.studentProfile.put({ ...(existing ?? {}), onboardingComplete: false, intendedMajors: [] });

      // The onboarding-built "path" — suggested goals — is regenerated, so clear it.
      let goalsRemoved = 0;
      for (const g of await data.goals.list()) {
        try {
          await data.goals.delete(g.goalId);
          goalsRemoved++;
        } catch {
          /* best-effort */
        }
      }
      // Only the AI-discovered/seeded colleges; manually-added research is real and kept.
      let collegesRemoved = 0;
      for (const c of await data.colleges.list()) {
        if (c.addedBy !== 'ai-discovered') continue;
        try {
          await data.colleges.delete(c.collegeId);
          collegesRemoved++;
        } catch {
          /* best-effort */
        }
      }
      return { status: 200, body: { ok: true, goalsRemoved, collegesRemoved } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: OnboardingHandlers) {
  return [
    { method: 'POST' as const, path: '/onboarding/chat', handler: h.chat },
    { method: 'POST' as const, path: '/onboarding/finish', handler: h.finish },
    { method: 'POST' as const, path: '/onboarding/reset', handler: h.reset },
  ];
}

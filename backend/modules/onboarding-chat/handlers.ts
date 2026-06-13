// Conversational onboarding handlers. Two endpoints:
//   POST /onboarding/chat   — one model-only chat turn (interview + structured extraction).
//   POST /onboarding/finish — persist the gathered profile (onboardingComplete), then SEED the student:
//                             a few starter goals (model-only suggester) + an async college-discovery
//                             job for the intended major. Seeding is best-effort: a failure there never
//                             blocks finishing onboarding. Family-visible; identity from the JWT.

import { Errors, validateBody, type Handler } from '../../shared/api/index.js';
import type { Data, StudentProfile } from '../../shared/data/index.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';
import { chatSchema, finishSchema } from './schema.js';
import { type CollegeSeeder, type OnboardingChatter, type OnboardingProfile } from './ai.js';

/** A college job dispatcher (hydration or assets) — `(collegeId) => Promise<void>`. */
type CollegeJobDispatcher = (collegeId: string) => Promise<void>;

export interface OnboardingHandlers {
  chat: Handler;
  finish: Handler;
  reset: Handler;
}

export interface OnboardingDeps {
  getData: () => Data;
  chatter: OnboardingChatter;
  suggester: GoalSuggester;
  /** Names a few starter colleges for the major (model-only). */
  collegeSeeder: CollegeSeeder;
  /** Kick off text hydration for a newly-seeded college. */
  hydrateDispatch: CollegeJobDispatcher;
  /** Kick off imagery/assets for a newly-seeded college. */
  assetsDispatch: CollegeJobDispatcher;
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
  const { getData, chatter, suggester, collegeSeeder, hydrateDispatch, assetsDispatch } = deps;

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

      // Seed a few real starter colleges for the major and hydrate them, so the dashboard + Colleges
      // page aren't empty on arrival (best-effort). Names come model-only; the async hydration pipeline
      // fills in tuition/deadlines/etc. Skips any name already in the list (idempotent across re-runs).
      let collegesCreated = 0;
      try {
        const suggestions = await collegeSeeder(majors, saved.location ?? undefined);
        const existing = await data.colleges.list();
        const seen = new Set(existing.map((c) => c.name.trim().toLowerCase()));
        for (const s of suggestions.slice(0, 12)) {
          if (seen.has(s.name.trim().toLowerCase())) continue;
          seen.add(s.name.trim().toLowerCase());
          const created = await data.colleges.create({
            name: s.name,
            state: s.state,
            status: 'researching',
            addedBy: 'ai-discovered',
            userEdited: [],
            hydrationStatus: 'in-progress',
            assetsStatus: 'in-progress',
          } as Parameters<Data['colleges']['create']>[0]);
          await hydrateDispatch(created.collegeId);
          await assetsDispatch(created.collegeId);
          collegesCreated++;
        }
      } catch {
        /* college seeding is non-fatal — the family can run the College Finder later */
      }

      // Seed the canonical budget so it shows on the dashboard + FinAid (profile.budget alone doesn't
      // reach them). Best-effort; update if a budget already exists, else create.
      if (saved.budget?.total != null) {
        try {
          const existingBudget = await data.budget.get();
          if (existingBudget) {
            await data.budget.update({ totalBudget: saved.budget.total });
          } else {
            await data.budget.put({ totalBudget: saved.budget.total } as Parameters<Data['budget']['put']>[0]);
          }
        } catch {
          /* non-fatal — the family can set the budget on the FinAid page */
        }
      }

      return { status: 200, body: { profile: saved, goalsCreated, collegesCreated } };
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

// Student-profile handlers (v2.1 F4): the missing GET/PUT /profile the spec called for. Backs the
// first-run onboarding wizard — a global singleton (STUDENT_PROFILE) any family member can edit.
// GET returns sensible defaults (onboardingComplete:false) when nothing is saved yet, so the wizard
// knows to show.

import { validateBody, type Handler } from '../../shared/api/index.js';
import type { Data } from '../../shared/data/index.js';
import { profileBodySchema } from './schema.js';

export interface ProfileHandlers {
  get: Handler;
  put: Handler;
}

export interface ProfileDeps {
  getData: () => Data;
}

const DEFAULT_PROFILE = { onboardingComplete: false };

export function makeHandlers(deps: ProfileDeps): ProfileHandlers {
  const { getData } = deps;
  return {
    get: async () => {
      const stored = await getData().studentProfile.get();
      return { status: 200, body: stored ?? DEFAULT_PROFILE };
    },

    put: async (ctx) => {
      const patch = validateBody(profileBodySchema, ctx);
      const data = getData();
      const existing = await data.studentProfile.get();
      // Spread suppresses excess-property checks; the repo re-stamps createdAt/updatedAt.
      const saved = await data.studentProfile.put({
        ...(existing ?? {}),
        ...patch,
        updatedBy: ctx.requester.username,
      });
      return { status: 200, body: saved };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: ProfileHandlers) {
  return [
    { method: 'GET' as const, path: '/profile', handler: h.get },
    { method: 'PUT' as const, path: '/profile', handler: h.put },
  ];
}

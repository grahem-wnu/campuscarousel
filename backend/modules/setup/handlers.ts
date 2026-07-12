// Setup handlers — family-level FTUE progress for the multi-student onboarding loop.
//   GET /setup — read the progress singleton (any family role; the onboarding gate needs it).
//   PUT /setup — merge declaredStudentCount / setupComplete (admin/parent only).
// Tenant-scoped, NOT per-child: the roster and "how many kids" are family facts.

import { validateBody, type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { setupBodySchema } from './schema.js';

export interface SetupHandlers {
  get: Handler;
  put: Handler;
}

export interface SetupDeps {
  getData: () => Data;
}

/** Only parents/admins shape the family's setup; a student may read it (the gate runs for them too). */
const requireGuardian = requireRole('admin', 'parent');

export function makeHandlers(deps: SetupDeps): SetupHandlers {
  const { getData } = deps;
  return {
    // GET /setup — empty object before anything is saved (no 404 — absence is "fresh family").
    get: async () => ({ status: 200, body: (await getData().setupState.get()) ?? {} }),

    // PUT /setup — upsert merge of the provided fields.
    put: async (ctx) => {
      requireGuardian(ctx.requester);
      const patch = validateBody(setupBodySchema, ctx);
      const saved = await getData().setupState.update({ ...patch, updatedBy: ctx.requester.username });
      return { status: 200, body: saved };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). */
export function buildRoutes(h: SetupHandlers) {
  return [
    { method: 'GET' as const, path: '/setup', handler: h.get },
    { method: 'PUT' as const, path: '/setup', handler: h.put },
  ];
}

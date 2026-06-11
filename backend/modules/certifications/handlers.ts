// Certifications handlers. Certifications are family-visible (specs/modules/certifications.md), so
// there is no private-entry filtering here — but identity still comes from the JWT (ctx.requester),
// and every endpoint is reachable only by an authenticated caller (the router resolves identity and
// 401s otherwise). Handlers are built from a `getData` thunk + injectable deps so tests inject an
// in-memory data client, a pinned clock, and a stub suggester; production injects the real ones
// (lazily, see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data } from '../../shared/data/index.js';
import {
  createSchema,
  expiringQuerySchema,
  idParamSchema,
  listQuerySchema,
  suggestSchema,
  updateSchema,
} from './schema.js';
import { decorate, EXPIRING_SOON_DAYS, isExpiringWithin } from './status.js';
import { curatedSuggester, DEFAULT_CAREER_GOAL, type Suggester } from './suggester.js';

export interface CertHandlers {
  list: Handler;
  expiring: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  suggest: Handler;
}

export interface CertDeps {
  /** Lazily-resolved data client (so importing the manifest never requires TABLE_NAME). */
  getData: () => Data;
  /** Suggestion source for /suggest; defaults to the deterministic curated suggester. */
  suggester?: Suggester;
  /** Clock seam — pinned in tests, `new Date()` in production. */
  now?: () => Date;
}

const todayIso = (now: () => Date): string => now().toISOString().slice(0, 10);

/** Read the career goal from the caller's profile preferences, tolerating an absent profile. */
async function careerGoalFromProfile(data: Data, username: string): Promise<string | undefined> {
  try {
    const profile = await data.profiles.get(username);
    const goal = profile?.preferences?.['careerGoal'];
    return typeof goal === 'string' && goal.trim().length > 0 ? goal : undefined;
  } catch {
    return undefined;
  }
}

/** Read the active student's intended major(s) so a major pack can supply curated certs. */
async function majorsFromProfile(data: Data): Promise<string[]> {
  try {
    return (await data.studentProfile.get())?.intendedMajors ?? [];
  } catch {
    return [];
  }
}

export function makeHandlers(deps: CertDeps): CertHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const suggester = deps.suggester ?? curatedSuggester;

  return {
    // GET /certifications — list (optionally filtered by effective status), decorated for the UI.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const today = todayIso(now);
      let items = (await getData().certifications.list()).map((c) => decorate(c, today));
      if (q.status) items = items.filter((c) => c.effectiveStatus === q.status);
      return { status: 200, body: { certifications: items } };
    },

    // GET /certifications/expiring — forward-looking heads-up within N days (default 90), soonest first.
    expiring: async (ctx) => {
      const q = validateQuery(expiringQuerySchema, ctx);
      const days = q.days ?? EXPIRING_SOON_DAYS;
      const today = todayIso(now);
      const items = (await getData().certifications.list())
        .filter((c) => isExpiringWithin(c, days, today))
        .map((c) => decorate(c, today))
        .sort((a, b) => (a.daysUntilExpiration ?? 0) - (b.daysUntilExpiration ?? 0));
      return { status: 200, body: { certifications: items, days } };
    },

    // GET /certifications/:id — detail.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const item = await getData().certifications.get(id);
      if (!item) throw Errors.notFound('Certification not found');
      return { status: 200, body: decorate(item, todayIso(now)) };
    },

    // POST /certifications — create.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().certifications.create(input);
      return { status: 201, body: decorate(created, todayIso(now)) };
    },

    // PUT /certifications/:id — update.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.certifications.get(id);
      if (!existing) throw Errors.notFound('Certification not found');
      const updated = await data.certifications.update(id, patch);
      return { status: 200, body: decorate(updated, todayIso(now)) };
    },

    // DELETE /certifications/:id — delete.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.certifications.get(id);
      if (!existing) throw Errors.notFound('Certification not found');
      await data.certifications.delete(id);
      return { status: 204, body: undefined };
    },

    // POST /certifications/suggest — AI/curated suggestions for the career goal, minus what's held.
    suggest: async (ctx) => {
      const body = validateBody(suggestSchema, ctx);
      const data = getData();
      const careerGoal =
        body.careerGoal ??
        (await careerGoalFromProfile(data, ctx.requester.username)) ??
        DEFAULT_CAREER_GOAL;
      const existingNames = (await data.certifications.list()).map((c) => c.name);
      const majors = await majorsFromProfile(data);
      const suggestions = await suggester({ careerGoal, existingNames, majors });
      return { status: 200, body: { careerGoal, suggestions } };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test, so
 * there is one source of truth for paths. The static `/certifications/expiring` and
 * `/certifications/suggest` are listed before `/certifications/:id`; the router also prefers static
 * segments, so they never collide with the id route.
 */
export function buildRoutes(handlers: CertHandlers) {
  return [
    { method: 'GET' as const, path: '/certifications/expiring', handler: handlers.expiring },
    { method: 'POST' as const, path: '/certifications/suggest', handler: handlers.suggest },
    { method: 'GET' as const, path: '/certifications', handler: handlers.list },
    { method: 'POST' as const, path: '/certifications', handler: handlers.create },
    { method: 'GET' as const, path: '/certifications/:id', handler: handlers.detail },
    { method: 'PUT' as const, path: '/certifications/:id', handler: handlers.update },
    { method: 'DELETE' as const, path: '/certifications/:id', handler: handlers.remove },
  ];
}

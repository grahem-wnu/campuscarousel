// Exam Prep handlers. Records are family-visible (specs/modules/exam-prep.md) — no private filtering
// — but identity comes from the JWT (ctx.requester) and the router 401s unauthenticated callers.
// Built from injectable deps so tests supply an in-memory data client, a pinned clock, and stub
// planner/analyzer; production injects the Bedrock-backed ones (lazily, see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import type { Data } from '../../shared/data/index.js';
import {
  analyzeSchema,
  createSchema,
  idParamSchema,
  listQuerySchema,
  studyPlanSchema,
  updateSchema,
} from './schema.js';
import {
  SECTION_LABEL,
  latest,
  progression,
  readiness,
  summarize,
  weakSections,
} from './progress.js';
import {
  makeBedrockAnalyzer,
  makeBedrockPlanner,
  type Analyzer,
  type Planner,
} from './ai.js';

const DEFAULT_TARGET = 78;
const DEFAULT_HOURS_PER_WEEK = 8;

export interface ExamHandlers {
  list: Handler;
  detail: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
  progress: Handler;
  studyPlan: Handler;
  analyze: Handler;
}

export interface ExamDeps {
  getData: () => Data;
  planner?: Planner;
  analyzer?: Analyzer;
  now?: () => Date;
}

/** Whole weeks (rounded up, never negative) from today until an exam date, or null. */
function weeksUntil(examDate: string | undefined, today: Date): number | null {
  if (!examDate) return null;
  const target = Date.parse(`${examDate}T00:00:00Z`);
  const base = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(base)) return null;
  return Math.max(0, Math.ceil((target - base) / (7 * 86_400_000)));
}

export function makeHandlers(deps: ExamDeps): ExamHandlers {
  const { getData } = deps;
  const now = deps.now ?? (() => new Date());
  const planner = deps.planner ?? makeBedrockPlanner();
  const analyzer = deps.analyzer ?? makeBedrockAnalyzer();

  return {
    // GET /exams — list (optionally by type), date-ordered.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let records = await getData().exams.list();
      if (q.type) records = records.filter((r) => r.type === q.type);
      return { status: 200, body: { records } };
    },

    // GET /exams/:id.
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const record = await getData().exams.get(id);
      if (!record) throw Errors.notFound('Exam record not found');
      return { status: 200, body: record };
    },

    // POST /exams.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().exams.create(input);
      return { status: 201, body: created };
    },

    // PUT /exams/:id.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      if (!(await data.exams.get(id))) throw Errors.notFound('Exam record not found');
      return { status: 200, body: await data.exams.update(id, patch) };
    },

    // DELETE /exams/:id.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      if (!(await data.exams.get(id))) throw Errors.notFound('Exam record not found');
      await data.exams.delete(id);
      return { status: 204, body: undefined };
    },

    // GET /exams/progress — progression series + roll-up summary + readiness.
    progress: async () => {
      const records = await getData().exams.list();
      return {
        status: 200,
        body: {
          progression: progression(records),
          summary: summarize(records),
          readiness: readiness(records, DEFAULT_TARGET),
        },
      };
    },

    // POST /exams/study-plan — AI weekly plan keyed to weak sections + exam date + target.
    studyPlan: async (ctx) => {
      const body = validateBody(studyPlanSchema, ctx);
      const records = await getData().exams.list();
      const weakLabels = weakSections(records).map((s) => SECTION_LABEL[s]);
      const plan = await planner({
        weeksUntilExam: weeksUntil(body.examDate, now()),
        examDate: body.examDate,
        targetScore: body.targetScore ?? DEFAULT_TARGET,
        targetSchools: body.targetSchools,
        hoursPerWeek: body.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK,
        weakSections: body.focusAreas ?? weakLabels,
        latestOverall: latest(records)?.overallScore ?? null,
      });
      return { status: 200, body: { plan } };
    },

    // POST /exams/analyze — AI trend analysis + recommendations + readiness.
    analyze: async (ctx) => {
      const body = validateBody(analyzeSchema, ctx);
      const records = await getData().exams.list();
      const analysis = await analyzer({
        summary: summarize(records),
        targetScore: body.targetScore ?? DEFAULT_TARGET,
        examDate: body.examDate,
      });
      return { status: 200, body: { analysis } };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test). Static
 *  segments are listed before the `:id` routes; the router also prefers higher static specificity. */
export function buildRoutes(h: ExamHandlers) {
  return [
    { method: 'GET' as const, path: '/exams/progress', handler: h.progress },
    { method: 'POST' as const, path: '/exams/study-plan', handler: h.studyPlan },
    { method: 'POST' as const, path: '/exams/analyze', handler: h.analyze },
    { method: 'GET' as const, path: '/exams', handler: h.list },
    { method: 'POST' as const, path: '/exams', handler: h.create },
    { method: 'GET' as const, path: '/exams/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/exams/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/exams/:id', handler: h.remove },
  ];
}

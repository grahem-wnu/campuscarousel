// Course Planner handlers. Courses are family-visible — every authenticated caller may read and
// write them, so there is no visibility filtering here (contrast with the activity-journal /
// clinical-hours privacy rule). Handlers are built from a `getData` thunk so tests inject an
// in-memory data client and production injects `dataFromEnv()` lazily (see routes.manifest.ts).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
  type RouteDef,
} from '../../shared/api/index.js';
import type { Course, Data } from '../../shared/data/index.js';
import { computeGpa } from './gpa.js';
import { buildPrereqMatrix, checkPrerequisites } from './prerequisites.js';
import { collegeIdParamSchema, createSchema, idParamSchema, listQuerySchema, updateSchema } from './schema.js';

export interface CourseHandlers {
  list: Handler;
  gpa: Handler;
  prerequisites: Handler;
  prerequisitesMatrix: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

export function makeHandlers(getData: () => Data): CourseHandlers {
  return {
    // GET /courses — full list, optionally filtered by year/subject (filtered in-memory; the
    // collection has no dedicated index for these).
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      let items: Course[] = await getData().courses.list();
      if (q.year) items = items.filter((c) => c.year === q.year);
      if (q.subject) items = items.filter((c) => c.subject === q.subject);
      return { status: 200, body: { courses: items } };
    },

    // GET /courses/gpa — weighted + unweighted GPA over all graded courses.
    gpa: async () => {
      const items = await getData().courses.list();
      return { status: 200, body: computeGpa(items) };
    },

    // GET /courses/prerequisites/:collegeId — satisfaction check against one college's prereqs.
    prerequisites: async (ctx) => {
      const { collegeId } = validateParams(collegeIdParamSchema, ctx);
      const data = getData();
      const college = await data.colleges.get(collegeId);
      if (!college) throw Errors.notFound('College not found');
      const courses = await data.courses.list();
      return { status: 200, body: checkPrerequisites(college, courses) };
    },

    // GET /courses/prerequisites — full courses×target-colleges matrix across every pursued college.
    prerequisitesMatrix: async () => {
      const data = getData();
      const [colleges, courses] = await Promise.all([data.colleges.list(), data.courses.list()]);
      return { status: 200, body: buildPrereqMatrix(colleges, courses) };
    },

    // POST /courses
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      const created = await getData().courses.create(input);
      return { status: 201, body: created };
    },

    // PUT /courses/:id — e.g. add a final grade.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const data = getData();
      const existing = await data.courses.get(id);
      if (!existing) throw Errors.notFound('Course not found');
      const updated = await data.courses.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /courses/:id
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const data = getData();
      const existing = await data.courses.get(id);
      if (!existing) throw Errors.notFound('Course not found');
      await data.courses.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/**
 * The module's route table. Shared by the manifest (production) and the router integration test,
 * so there is one source of truth for paths. The static `/courses/gpa` and
 * `/courses/prerequisites/:collegeId` are listed before `/courses/:id`; the router also prefers
 * static segments, so they never collide.
 */
export function buildRoutes(handlers: CourseHandlers): RouteDef[] {
  return [
    { method: 'GET', path: '/courses/gpa', handler: handlers.gpa },
    { method: 'GET', path: '/courses/prerequisites', handler: handlers.prerequisitesMatrix },
    { method: 'GET', path: '/courses/prerequisites/:collegeId', handler: handlers.prerequisites },
    { method: 'GET', path: '/courses', handler: handlers.list },
    { method: 'POST', path: '/courses', handler: handlers.create },
    { method: 'PUT', path: '/courses/:id', handler: handlers.update },
    { method: 'DELETE', path: '/courses/:id', handler: handlers.remove },
  ];
}

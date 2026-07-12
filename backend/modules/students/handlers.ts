// Student roster handlers (multi-student per family). The roster is FAMILY-LEVEL (tenant-scoped, not
// per-child), so these run inside the tenant context the router sets but need no active student.
// Listing is open to any family role (the switcher needs it); mutations are admin/parent only.

import { Errors, validateBody, validateParams, type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { createStudentSchema, studentParamSchema, updateStudentSchema } from './schema.js';

export interface StudentHandlers {
  list: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

export interface StudentDeps {
  getData: () => Data;
}

/** Only parents/admins can change the roster (a student can read it for the switcher). */
const requireGuardian = requireRole('admin', 'parent');

export function makeHandlers(deps: StudentDeps): StudentHandlers {
  const { getData } = deps;
  return {
    // GET /students — the family roster, oldest first (stable switcher order).
    list: async () => {
      return { status: 200, body: { students: await getData().students.list() } };
    },

    // POST /students — add a child to the family.
    create: async (ctx) => {
      requireGuardian(ctx.requester);
      const input = validateBody(createStudentSchema, ctx);
      const student = await getData().students.create({ ...input, status: 'active' });
      return { status: 201, body: student };
    },

    // PATCH /students/:studentId — rename / set graduation year / archive.
    update: async (ctx) => {
      requireGuardian(ctx.requester);
      const { studentId } = validateParams(studentParamSchema, ctx);
      const patch = validateBody(updateStudentSchema, ctx);
      const existing = await getData().students.get(studentId);
      if (!existing) throw Errors.notFound('Student not found');
      return { status: 200, body: await getData().students.update(studentId, patch) };
    },

    // DELETE /students/:studentId — remove a child from the roster. The child's per-child data is left
    // in place (keyed under S#<studentId>#); removing it is a separate, deliberate hard-delete concern.
    remove: async (ctx) => {
      requireGuardian(ctx.requester);
      const { studentId } = validateParams(studentParamSchema, ctx);
      const existing = await getData().students.get(studentId);
      if (!existing) throw Errors.notFound('Student not found');
      await getData().students.delete(studentId);
      return { status: 204, body: undefined };
    },
  };
}

/** Single source of truth for the route table. */
export function buildRoutes(h: StudentHandlers) {
  return [
    { method: 'GET' as const, path: '/students', handler: h.list },
    { method: 'POST' as const, path: '/students', handler: h.create },
    { method: 'PATCH' as const, path: '/students/:studentId', handler: h.update },
    { method: 'DELETE' as const, path: '/students/:studentId', handler: h.remove },
  ];
}

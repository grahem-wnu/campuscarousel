// ⚠️ TEMPORARY TESTING AID — remove when FTUE testing is done (delete this module dir, re-run
// `npm run gen:manifests -w backend`, and drop the Family-page "Hard reset" button + hardReset() api).
//
// POST /admin/hard-reset — admin-only, TENANT-SCOPED hard reset for re-testing the first-time
// experience. Empties the family's student roster and clears the /setup progress singleton, so the
// onboarding gate bootstraps the multi-student loop from scratch on the next load. It does NOT touch
// other tenants (everything goes through the tenant-scoped Data layer) and does NOT delete per-child
// data — orphaned S#<id># partitions are unreachable once their roster entry is gone, and each new
// test child gets a fresh studentId, so the dashboard is clean per run.

import { type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';

export interface DevResetHandlers {
  hardReset: Handler;
}

export interface DevResetDeps {
  getData: () => Data;
}

const requireAdmin = requireRole('admin');

export function makeHandlers(deps: DevResetDeps): DevResetHandlers {
  const { getData } = deps;
  return {
    hardReset: async (ctx) => {
      requireAdmin(ctx.requester);
      const data = getData();
      const students = await data.students.list();
      let studentsRemoved = 0;
      for (const s of students) {
        await data.students.delete(s.studentId);
        studentsRemoved++;
      }
      // Clear declaredStudentCount / setupComplete so the gate sees a fresh family.
      await data.setupState.put({});
      return { status: 200, body: { ok: true, studentsRemoved } };
    },
  };
}

export function buildRoutes(h: DevResetHandlers) {
  return [{ method: 'POST' as const, path: '/admin/hard-reset', handler: h.hardReset }];
}

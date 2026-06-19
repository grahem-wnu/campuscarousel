// ⚠️ TEMPORARY TESTING AID — remove when FTUE testing is done (delete this module dir, re-run
// `npm run gen:manifests -w backend`, and drop the Family-page "Hard reset" button + hardReset() api).
//
// POST /admin/hard-reset — admin-only, TENANT-SCOPED hard reset for re-testing the first-time
// experience. Empties the family's student roster and clears the /setup progress singleton, so the
// onboarding gate bootstraps the multi-student loop from scratch on the next load. It does NOT touch
// other tenants (everything goes through the tenant-scoped Data layer). Each removed student's
// per-child data (`T#<tenant>#S#<id>#…` — colleges, profile, etc.) is PURGED first, so repeated test
// runs don't leave orphaned partitions accumulating in the table.

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
      let itemsPurged = 0;
      for (const s of students) {
        itemsPurged += await data.purgeStudent(s.studentId); // wipe the child's data, not just the roster entry
        await data.students.delete(s.studentId);
        studentsRemoved++;
      }
      // Clear declaredStudentCount / setupComplete so the gate sees a fresh family.
      await data.setupState.put({});
      return { status: 200, body: { ok: true, studentsRemoved, itemsPurged } };
    },
  };
}

export function buildRoutes(h: DevResetHandlers) {
  return [{ method: 'POST' as const, path: '/admin/hard-reset', handler: h.hardReset }];
}

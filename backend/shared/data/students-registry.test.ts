import { describe, expect, it } from 'vitest';
import { runWithStudent, runWithTenant } from '../tenant/index.js';
import { InMemoryTableClient, makeData } from './index.js';
import { ConditionFailedError } from './table-client.js';
import { studentScoped, tenantScoped } from './tenant-client.js';

// The student registry is FAMILY-LEVEL (tenant-scoped, not per-child) — it lists a family's kids.
describe('student registry', () => {
  it('creates, lists, updates, and deletes students', async () => {
    const data = makeData(new InMemoryTableClient());
    const keira = await data.students.create({ name: 'Keira', graduationYear: 2030, status: 'active' });
    const sib = await data.students.create({ name: 'Sibling', status: 'active' });
    expect((await data.students.list()).map((s) => s.name).sort()).toEqual(['Keira', 'Sibling']);

    const updated = await data.students.update(keira.studentId, { graduationYear: 2031 });
    expect(updated).toMatchObject({ name: 'Keira', graduationYear: 2031, createdAt: keira.createdAt });

    await data.students.delete(sib.studentId);
    expect((await data.students.list()).map((s) => s.name)).toEqual(['Keira']);
  });

  it('linkLogin binds a login only when the child has none — a second link loses (ConditionFailed)', async () => {
    const data = makeData(new InMemoryTableClient());
    const keira = await data.students.create({ name: 'Keira', status: 'active' });

    const linked = await data.students.linkLogin(keira.studentId, 'keira-login');
    expect(linked.loginUserId).toBe('keira-login');
    expect((await data.students.get(keira.studentId))!.loginUserId).toBe('keira-login');

    // A concurrent/duplicate link attempt must lose — one login per child.
    await expect(data.students.linkLogin(keira.studentId, 'other-login')).rejects.toBeInstanceOf(ConditionFailedError);
    expect((await data.students.get(keira.studentId))!.loginUserId).toBe('keira-login');
  });
});

// Full-stack per-child proof using the PRODUCTION client composition.
describe('per-child data isolation (production wiring)', () => {
  const raw = new InMemoryTableClient();
  const family = tenantScoped(raw);
  const data = makeData(studentScoped(family), raw, family);
  const asChild = <T>(tenant: string, student: string, fn: () => Promise<T> | T) =>
    runWithTenant(tenant, () => runWithStudent(student, fn));

  it("one child's activities never leak into a sibling's list, and the roster is shared", async () => {
    // Roster lives at family level (no student context needed).
    const keira = await runWithTenant('fam', () => data.students.create({ name: 'Keira', status: 'active' }));
    const milo = await runWithTenant('fam', () => data.students.create({ name: 'Milo', status: 'active' }));

    await asChild('fam', keira.studentId, () =>
      data.activities.create({ title: 'Hospital volunteering', date: '2026-06-01', category: 'volunteer' } as never),
    );
    await asChild('fam', milo.studentId, () =>
      data.activities.create({ title: 'Robotics club', date: '2026-06-02', category: 'extracurricular' } as never),
    );

    const keiraActivities = await asChild('fam', keira.studentId, () => data.activities.list());
    const miloActivities = await asChild('fam', milo.studentId, () => data.activities.list());
    expect(keiraActivities.map((a) => a.title)).toEqual(['Hospital volunteering']);
    expect(miloActivities.map((a) => a.title)).toEqual(['Robotics club']);

    // Both kids appear in the one family roster.
    const roster = await runWithTenant('fam', () => data.students.list());
    expect(roster.map((s) => s.name).sort()).toEqual(['Keira', 'Milo']);
  });
});

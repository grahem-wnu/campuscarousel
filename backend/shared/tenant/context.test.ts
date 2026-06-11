import { describe, expect, it } from 'vitest';
import {
  StudentContextError,
  TenantContextError,
  currentStudentId,
  currentTenantId,
  maybeStudentId,
  maybeTenantId,
  runWithStudent,
  runWithTenant,
} from './context.js';

describe('tenant context', () => {
  it('returns the tenant set by runWithTenant', async () => {
    const id = await runWithTenant('t1', async () => currentTenantId());
    expect(id).toBe('t1');
  });

  it('throws TenantContextError when no tenant is set (fail closed)', () => {
    expect(() => currentTenantId()).toThrow(TenantContextError);
  });

  it('maybeTenantId returns undefined when unset, value when set', async () => {
    expect(maybeTenantId()).toBeUndefined();
    expect(await runWithTenant('t9', async () => maybeTenantId())).toBe('t9');
  });

  it('throws if tenantId is empty', () => {
    expect(() => runWithTenant('', () => 1)).toThrow(TenantContextError);
  });

  it('isolates concurrent contexts', async () => {
    const [a, b] = await Promise.all([
      runWithTenant('A', async () => {
        await Promise.resolve();
        return currentTenantId();
      }),
      runWithTenant('B', async () => currentTenantId()),
    ]);
    expect([a, b]).toEqual(['A', 'B']);
  });

  it('survives awaits inside the callback', async () => {
    const id = await runWithTenant('t2', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentTenantId();
    });
    expect(id).toBe('t2');
  });
});

describe('student context (nested under tenant)', () => {
  it('runWithStudent sets the active student and preserves the tenant', async () => {
    const result = await runWithTenant('t1', () =>
      runWithStudent('s1', () => ({ tenant: currentTenantId(), student: currentStudentId() })),
    );
    expect(result).toEqual({ tenant: 't1', student: 's1' });
  });

  it('currentStudentId throws when no student is set, even inside a tenant (fail closed)', async () => {
    await runWithTenant('t1', () => {
      expect(() => currentStudentId()).toThrow(StudentContextError);
    });
  });

  it('runWithStudent throws TenantContextError when no tenant is set', () => {
    expect(() => runWithStudent('s1', () => 1)).toThrow(TenantContextError);
  });

  it('runWithStudent throws StudentContextError when studentId is empty', async () => {
    await runWithTenant('t1', () => {
      expect(() => runWithStudent('', () => 1)).toThrow(StudentContextError);
    });
  });

  it('maybeStudentId returns undefined when unset, value when set', async () => {
    expect(maybeStudentId()).toBeUndefined();
    const got = await runWithTenant('t1', () => runWithStudent('s9', () => maybeStudentId()));
    expect(got).toBe('s9');
  });

  it('isolates concurrent student contexts within tenants', async () => {
    const [a, b] = await Promise.all([
      runWithTenant('t1', () =>
        runWithStudent('A', async () => {
          await Promise.resolve();
          return currentStudentId();
        }),
      ),
      runWithTenant('t1', () => runWithStudent('B', () => currentStudentId())),
    ]);
    expect([a, b]).toEqual(['A', 'B']);
  });
});

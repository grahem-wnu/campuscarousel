import { describe, expect, it } from 'vitest';
import { TenantContextError, currentTenantId, maybeTenantId, runWithTenant } from './context.js';

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

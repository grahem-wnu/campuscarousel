import { describe, expect, it } from 'vitest';
import { runWithTenant } from '../../shared/tenant/index.js';
import { tenantDocKey } from './keys.js';

describe('tenantDocKey', () => {
  it('prefixes the object key with the current tenant', async () => {
    const key = await runWithTenant('fam1', async () => tenantDocKey('My Cert!.pdf'));
    expect(key).toMatch(/^T\/fam1\/documents\/.+\/My_Cert_\.pdf$/);
  });

  it('fails closed when there is no tenant context', () => {
    expect(() => tenantDocKey('x.pdf')).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations; we test the pure transform.
import { retkey, retkeyS3 } from './migrate-tenant.mjs';

describe('retkey', () => {
  it('prefixes PK and every present GSIxPK with the tenant', () => {
    const out = retkey(
      { PK: 'ACTIVITY#1', SK: 'DETAILS', GSI1PK: 'ACTIVITIES', GSI1SK: 'd#1', GSI2PK: 'CATEGORY#volunteer' },
      'fam1',
    );
    expect(out).toMatchObject({
      PK: 'T#fam1#ACTIVITY#1',
      SK: 'DETAILS', // sort keys untouched
      GSI1PK: 'T#fam1#ACTIVITIES',
      GSI2PK: 'T#fam1#CATEGORY#volunteer',
    });
  });

  it('skips the global tenant registry (returns null)', () => {
    expect(retkey({ PK: 'TENANT#fam1', SK: 'DETAILS', GSI1PK: 'TENANTS' }, 'fam1')).toBeNull();
  });

  it('is idempotent — skips already-prefixed items', () => {
    expect(retkey({ PK: 'T#fam1#ACTIVITY#1', SK: 'DETAILS' }, 'fam1')).toBeNull();
  });

  it('retkeyS3 prefixes an un-prefixed object key, idempotently', () => {
    expect(retkeyS3('documents/x/a.pdf', 'fam1')).toBe('T/fam1/documents/x/a.pdf');
    expect(retkeyS3('T/fam1/documents/x/a.pdf', 'fam1')).toBe('T/fam1/documents/x/a.pdf');
  });
});

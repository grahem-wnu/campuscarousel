import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations; we test the pure transform.
import { isFamilyLevelRest, restudentkey } from './migrate-student.mjs';

const T = 'fam1';
const S = 's-keira';

describe('restudentkey', () => {
  it('inserts the student tier into a per-child PK and every present GSIxPK', () => {
    const out = restudentkey(
      {
        PK: 'T#fam1#ACTIVITY#1',
        SK: 'DETAILS',
        GSI1PK: 'T#fam1#ACTIVITIES',
        GSI1SK: 'd#1',
        GSI2PK: 'T#fam1#CATEGORY#volunteer',
      },
      T,
      S,
    );
    expect(out).toMatchObject({
      PK: 'T#fam1#S#s-keira#ACTIVITY#1',
      SK: 'DETAILS', // sort keys untouched
      GSI1PK: 'T#fam1#S#s-keira#ACTIVITIES',
      GSI2PK: 'T#fam1#S#s-keira#CATEGORY#volunteer',
    });
  });

  it('skips FAMILY-LEVEL items: the student roster, user profiles, and reminder settings', () => {
    expect(restudentkey({ PK: 'T#fam1#STUDENT#s-keira', SK: 'DETAILS' }, T, S)).toBeNull();
    expect(restudentkey({ PK: 'T#fam1#USER#kate', SK: 'PROFILE' }, T, S)).toBeNull();
    expect(restudentkey({ PK: 'T#fam1#REMINDER_SETTINGS', SK: 'DETAILS' }, T, S)).toBeNull();
  });

  it('skips items from another tenant or the global registry (not under T#fam1#)', () => {
    expect(restudentkey({ PK: 'T#other#ACTIVITY#1', SK: 'DETAILS' }, T, S)).toBeNull();
    expect(restudentkey({ PK: 'TENANT#fam1', SK: 'DETAILS' }, T, S)).toBeNull();
  });

  it('is idempotent — skips items already carrying the student tier', () => {
    expect(restudentkey({ PK: 'T#fam1#S#s-keira#ACTIVITY#1', SK: 'DETAILS' }, T, S)).toBeNull();
  });

  it('isFamilyLevelRest recognises the three family-level shapes', () => {
    expect(isFamilyLevelRest('STUDENT#x')).toBe(true);
    expect(isFamilyLevelRest('USER#kate')).toBe(true);
    expect(isFamilyLevelRest('REMINDER_SETTINGS')).toBe(true);
    expect(isFamilyLevelRest('ACTIVITY#1')).toBe(false);
    expect(isFamilyLevelRest('COLLEGE#abc')).toBe(false);
  });
});

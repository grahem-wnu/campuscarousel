import { describe, it, expect } from 'vitest';
import {
  aiVisibleSet,
  assertCanRead,
  canSeePrivate,
  filterForRequester,
} from './visibility.js';
import { ForbiddenError } from './errors.js';
import type { Requester, Visible } from './types.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

interface Entry extends Visible {
  id: string;
}

const familyEntry: Entry = { id: 'f1', visibility: 'family' };
const privateEntry: Entry = { id: 'p1', visibility: 'private' };
const unmarkedEntry: Entry = { id: 'u1' }; // no visibility field → treated as family
const entries: Entry[] = [familyEntry, privateEntry, unmarkedEntry];

describe('canSeePrivate', () => {
  it('is true only for the student', () => {
    expect(canSeePrivate(keira)).toBe(true);
    expect(canSeePrivate(kate)).toBe(false);
    expect(canSeePrivate(grahem)).toBe(false); // admin is NOT privileged for private reads
  });
});

describe('filterForRequester (normal read path)', () => {
  it('keira (student) sees every entry, including private', () => {
    expect(filterForRequester(entries, keira)).toEqual(entries);
  });

  it('the parent CANNOT see private entries', () => {
    const visible = filterForRequester(entries, kate);
    expect(visible).toEqual([familyEntry, unmarkedEntry]);
    expect(visible).not.toContainEqual(privateEntry);
  });

  it('the admin CANNOT see private entries', () => {
    expect(filterForRequester(entries, grahem)).toEqual([familyEntry, unmarkedEntry]);
  });

  it('treats entries with no visibility field as family-visible', () => {
    expect(filterForRequester([unmarkedEntry], kate)).toEqual([unmarkedEntry]);
  });

  it('does not mutate the input array', () => {
    const input = [...entries];
    filterForRequester(input, kate);
    expect(input).toEqual(entries);
  });
});

describe('assertCanRead (fetch-by-id guard)', () => {
  it('allows the student to read a private entry', () => {
    expect(() => assertCanRead(privateEntry, keira)).not.toThrow();
  });

  it('blocks the parent from reading a private entry (403)', () => {
    expect(() => assertCanRead(privateEntry, kate)).toThrow(ForbiddenError);
    try {
      assertCanRead(privateEntry, kate);
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).status).toBe(403);
      expect((err as ForbiddenError).code).toBe('forbidden');
    }
  });

  it('blocks the admin from reading a private entry (403)', () => {
    expect(() => assertCanRead(privateEntry, grahem)).toThrow(ForbiddenError);
  });

  it('allows everyone to read family / unmarked entries', () => {
    expect(() => assertCanRead(familyEntry, kate)).not.toThrow();
    expect(() => assertCanRead(unmarkedEntry, grahem)).not.toThrow();
  });
});

describe('aiVisibleSet (AI context)', () => {
  it('gives the AI ALL entries (including private) when keira is the caller', () => {
    expect(aiVisibleSet(entries, keira)).toEqual(entries);
    expect(aiVisibleSet(entries, keira)).toContainEqual(privateEntry);
  });

  it('gives the AI only family entries when the parent is the caller', () => {
    expect(aiVisibleSet(entries, kate)).toEqual([familyEntry, unmarkedEntry]);
  });

  it('gives the AI only family entries when the admin is the caller', () => {
    expect(aiVisibleSet(entries, grahem)).toEqual([familyEntry, unmarkedEntry]);
  });
});

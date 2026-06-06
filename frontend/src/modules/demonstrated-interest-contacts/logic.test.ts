import { describe, expect, it } from 'vitest';
import { TOUCHPOINT_META, filterContacts, slotLabel, sortByDateDesc, touchpointLabel } from './logic';
import { RECOMMENDER_SLOTS, TOUCHPOINT_TYPES, type Contact } from './types';

const contact = (o: Partial<Contact>): Contact =>
  ({ contactId: 'c', name: 'X', createdAt: '', updatedAt: '', ...o }) as Contact;

describe('metadata', () => {
  it('has a label + icon for every touchpoint type', () => {
    for (const t of TOUCHPOINT_TYPES) {
      expect(TOUCHPOINT_META[t].label).toBeTruthy();
      expect(TOUCHPOINT_META[t].icon).toBeTruthy();
    }
  });
  it('labels every recommender slot + unassigned', () => {
    for (const s of RECOMMENDER_SLOTS) expect(slotLabel(s)).toBeTruthy();
    expect(slotLabel('unassigned')).toBe('Unassigned');
  });
  it('touchpointLabel resolves a known type', () => {
    expect(touchpointLabel('campus-visit')).toBe('Campus visit');
  });
});

describe('sortByDateDesc', () => {
  it('orders newest first, tie-broken by createdAt', () => {
    const out = sortByDateDesc([
      { date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z', id: 'a' },
      { date: '2026-03-01', createdAt: '2026-03-01T00:00:00Z', id: 'b' },
      { date: '2026-01-01', createdAt: '2026-01-01T09:00:00Z', id: 'c' },
    ] as { date: string; createdAt: string; id: string }[]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('filterContacts', () => {
  const contacts = [
    contact({ contactId: '1', name: 'Mr. Chu', role: 'AP Bio', organization: 'Mission HS', relationship: 'teacher', linkedCollegeId: 'col1' }),
    contact({ contactId: '2', name: 'Nurse Pat', organization: 'Hoag', relationship: 'nurse', linkedCollegeId: 'col2' }),
  ];
  it('returns all with no filters', () => {
    expect(filterContacts(contacts, {})).toHaveLength(2);
  });
  it('filters by relationship', () => {
    expect(filterContacts(contacts, { relationship: 'nurse' }).map((c) => c.contactId)).toEqual(['2']);
  });
  it('filters by linked college', () => {
    expect(filterContacts(contacts, { collegeId: 'col1' }).map((c) => c.contactId)).toEqual(['1']);
  });
  it('free-text matches name/role/org case-insensitively', () => {
    expect(filterContacts(contacts, { q: 'hoag' }).map((c) => c.contactId)).toEqual(['2']);
    expect(filterContacts(contacts, { q: 'AP BIO' }).map((c) => c.contactId)).toEqual(['1']);
  });
});

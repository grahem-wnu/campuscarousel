import { describe, expect, it } from 'vitest';
import type { Contact, Touchpoint } from '../../shared/data/index.js';
import { coverageGaps, groupRecommenders, isPendingFollowUp, sortFollowUps } from './logic.js';

const contact = (o: Partial<Contact>): Contact =>
  ({ contactId: 'c', name: 'X', createdAt: '', updatedAt: '', ...o }) as Contact;
const tp = (o: Partial<Touchpoint>): Touchpoint =>
  ({ collegeId: 'col', touchpointId: 't', type: 'email-exchange', date: '2026-01-01', createdAt: '', updatedAt: '', ...o }) as Touchpoint;

describe('groupRecommenders', () => {
  it('buckets potential recommenders by slot, with an unassigned group, ignoring non-recommenders', () => {
    const groups = groupRecommenders([
      contact({ contactId: '1', name: 'Mr. Chu', isPotentialRecommender: true, recommenderSlot: 'stem-teacher' }),
      contact({ contactId: '2', name: 'Nurse Pat', isPotentialRecommender: true, recommenderSlot: 'clinical-supervisor' }),
      contact({ contactId: '3', name: 'No slot', isPotentialRecommender: true }),
      contact({ contactId: '4', name: 'Not a rec', isPotentialRecommender: false }),
    ]);
    const bySlot = Object.fromEntries(groups.map((g) => [g.slot, g.contacts.map((c) => c.contactId)]));
    expect(bySlot['stem-teacher']).toEqual(['1']);
    expect(bySlot['clinical-supervisor']).toEqual(['2']);
    expect(bySlot['humanities-teacher']).toEqual([]);
    expect(bySlot['unassigned']).toEqual(['3']);
    // The non-recommender never appears.
    expect(groups.flatMap((g) => g.contacts.map((c) => c.contactId))).not.toContain('4');
  });

  it('always returns the four canonical slots in order plus unassigned', () => {
    const slots = groupRecommenders([]).map((g) => g.slot);
    expect(slots).toEqual(['stem-teacher', 'humanities-teacher', 'clinical-supervisor', 'community-leader', 'unassigned']);
  });
});

describe('coverageGaps', () => {
  it('lists slots with no assigned recommender', () => {
    const gaps = coverageGaps([
      contact({ isPotentialRecommender: true, recommenderSlot: 'stem-teacher' }),
      contact({ isPotentialRecommender: true, recommenderSlot: 'clinical-supervisor' }),
    ]);
    expect(gaps).toEqual(['humanities-teacher', 'community-leader']);
  });
  it('is all four when none are assigned', () => {
    expect(coverageGaps([])).toHaveLength(4);
  });
});

describe('isPendingFollowUp', () => {
  it('is true only when needed and not completed', () => {
    expect(isPendingFollowUp(tp({ followUpNeeded: true, followUpCompleted: false }))).toBe(true);
    expect(isPendingFollowUp(tp({ followUpNeeded: true, followUpCompleted: true }))).toBe(false);
    expect(isPendingFollowUp(tp({ followUpNeeded: false }))).toBe(false);
    expect(isPendingFollowUp(tp({}))).toBe(false);
  });
});

describe('sortFollowUps', () => {
  it('orders dated soonest-first, undated last', () => {
    const out = sortFollowUps([
      { followUpDate: undefined, id: 'none' },
      { followUpDate: '2026-05-01', id: 'late' },
      { followUpDate: '2026-02-01', id: 'soon' },
    ] as { followUpDate?: string; id: string }[]);
    expect(out.map((x) => x.id)).toEqual(['soon', 'late', 'none']);
  });
});

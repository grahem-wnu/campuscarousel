import { describe, expect, it } from 'vitest';
import {
  CATEGORY_META,
  activityLinkOptions,
  canSetPrivate,
  clinicalLinkOptions,
  filterBySearch,
  metaFor,
  previewOf,
  sortByDateDesc,
  visibilityLabel,
  withCurrentLink,
} from './logic';
import { CATEGORIES, type MotivationEntry } from './types';

const entry = (over: Partial<MotivationEntry> = {}): MotivationEntry => ({
  entryId: over.entryId ?? 'e1',
  date: '2026-01-10',
  title: 'A moment',
  content: 'Something meaningful happened.',
  visibility: 'family',
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
  ...over,
});

describe('CATEGORY_META', () => {
  it('has distinct icon + label for every category', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_META[c].label).toBeTruthy();
      expect(CATEGORY_META[c].icon).toBeTruthy();
    }
    const icons = CATEGORIES.map((c) => CATEGORY_META[c].icon);
    // At least several distinct glyphs so the timeline reads as varied.
    expect(new Set(icons).size).toBeGreaterThanOrEqual(5);
  });
});

describe('metaFor', () => {
  it('returns the category meta when present', () => {
    expect(metaFor('conversation').label).toBe('Conversation');
  });
  it('falls back to a neutral default when the category is undefined', () => {
    expect(metaFor(undefined).label).toBe('Entry');
    expect(metaFor(undefined).tone).toBe('neutral');
  });
});

describe('canSetPrivate', () => {
  it('is true only for the student role', () => {
    expect(canSetPrivate('student')).toBe(true);
    expect(canSetPrivate('parent')).toBe(false);
    expect(canSetPrivate('admin')).toBe(false);
    expect(canSetPrivate(undefined)).toBe(false);
  });
});

describe('sortByDateDesc', () => {
  it('orders newest date first, breaking ties by createdAt', () => {
    const a = entry({ entryId: 'a', date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z' });
    const b = entry({ entryId: 'b', date: '2026-03-01' });
    const c = entry({ entryId: 'c', date: '2026-01-01', createdAt: '2026-01-01T09:00:00Z' });
    const ordered = sortByDateDesc([a, b, c]).map((e) => e.entryId);
    expect(ordered).toEqual(['b', 'c', 'a']);
  });
  it('does not mutate the input', () => {
    const input = [entry({ entryId: 'a', date: '2026-01-01' }), entry({ entryId: 'b', date: '2026-02-01' })];
    const copy = [...input];
    sortByDateDesc(input);
    expect(input).toEqual(copy);
  });
});

describe('filterBySearch', () => {
  const items = [
    entry({ entryId: '1', title: 'ICU shift', content: 'A code blue', tags: ['icu'] }),
    entry({ entryId: '2', title: 'Aunt talk', content: 'She loves nursing', tags: ['family'] }),
  ];
  it('returns all when the query is empty', () => {
    expect(filterBySearch(items, '   ')).toHaveLength(2);
  });
  it('matches title, content, and tags case-insensitively', () => {
    expect(filterBySearch(items, 'CODE').map((e) => e.entryId)).toEqual(['1']);
    expect(filterBySearch(items, 'family').map((e) => e.entryId)).toEqual(['2']);
    expect(filterBySearch(items, 'nursing').map((e) => e.entryId)).toEqual(['2']);
  });
});

describe('visibilityLabel', () => {
  it('labels family and private', () => {
    expect(visibilityLabel('family')).toBe('Family');
    expect(visibilityLabel('private')).toBe('Private');
  });
});

describe('previewOf', () => {
  it('returns short content unchanged', () => {
    expect(previewOf('short')).toBe('short');
  });
  it('truncates long content with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = previewOf(long, 240);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(241);
  });
});

describe('link pickers (linking to journal/clinical entries)', () => {
  it('maps activities to {id,label} options, newest first', () => {
    const opts = activityLinkOptions([
      { activityId: 'a1', title: 'CHOC volunteering', date: '2026-01-01' },
      { activityId: 'a2', title: 'Blood drive', date: '2026-03-01' },
    ]);
    expect(opts).toEqual([
      { id: 'a2', label: '2026-03-01 · Blood drive' },
      { id: 'a1', label: '2026-01-01 · CHOC volunteering' },
    ]);
  });

  it('maps clinical entries to {id,label} options, newest first', () => {
    const opts = clinicalLinkOptions([
      { entryId: 'c1', facility: 'St. Joseph ICU', date: '2026-02-10' },
      { entryId: 'c2', facility: 'Hoag ER', date: '2026-04-10' },
    ]);
    expect(opts).toEqual([
      { id: 'c2', label: '2026-04-10 · Hoag ER' },
      { id: 'c1', label: '2026-02-10 · St. Joseph ICU' },
    ]);
  });

  it('keeps the currently-linked id selectable when it is missing from the fetched options', () => {
    const opts = [{ id: 'a1', label: '2026-01-01 · One' }];
    const merged = withCurrentLink(opts, 'a9');
    expect(merged[0]).toEqual({ id: 'a9', label: 'Linked entry (a9)' });
    expect(merged).toHaveLength(2);
  });

  it('does not duplicate an id that is already present, and is a no-op for no current link', () => {
    const opts = [{ id: 'a1', label: '2026-01-01 · One' }];
    expect(withCurrentLink(opts, 'a1')).toEqual(opts);
    expect(withCurrentLink(opts, undefined)).toEqual(opts);
    expect(withCurrentLink(opts, '')).toEqual(opts);
  });
});

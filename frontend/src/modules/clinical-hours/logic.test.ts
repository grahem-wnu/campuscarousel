import { describe, expect, it } from 'vitest';
import {
  benchmarkProgress,
  canSetPrivate,
  filterBySearch,
  formatHours,
  knownDepartments,
  knownFacilities,
  monthLabel,
  sortByDateDesc,
  toSortedRows,
  visibilityLabel,
} from './logic';
import type { Clinical } from './types';

const entry = (over: Partial<Clinical> = {}): Clinical => ({
  entryId: Math.random().toString(36).slice(2),
  date: '2026-01-15',
  facility: 'Memorial',
  hours: 4,
  visibility: 'family',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('canSetPrivate', () => {
  it('only the student role', () => {
    expect(canSetPrivate('student')).toBe(true);
    expect(canSetPrivate('parent')).toBe(false);
    expect(canSetPrivate('admin')).toBe(false);
    expect(canSetPrivate(undefined)).toBe(false);
  });
});

describe('visibilityLabel', () => {
  it('maps values to labels', () => {
    expect(visibilityLabel('private')).toBe('Private');
    expect(visibilityLabel('family')).toBe('Family');
  });
});

describe('sortByDateDesc', () => {
  it('orders newest first', () => {
    const out = sortByDateDesc([
      entry({ entryId: 'a', date: '2026-01-01' }),
      entry({ entryId: 'b', date: '2026-03-01' }),
      entry({ entryId: 'c', date: '2026-02-01' }),
    ]);
    expect(out.map((c) => c.entryId)).toEqual(['b', 'c', 'a']);
  });
});

describe('knownFacilities / knownDepartments', () => {
  it('returns distinct, sorted values', () => {
    const items = [
      entry({ facility: 'Lakeside', department: 'ICU' }),
      entry({ facility: 'Memorial', department: 'ER' }),
      entry({ facility: 'Memorial', department: 'ER' }),
    ];
    expect(knownFacilities(items)).toEqual(['Lakeside', 'Memorial']);
    expect(knownDepartments(items)).toEqual(['ER', 'ICU']);
  });
});

describe('filterBySearch', () => {
  it('matches across facility/department/supervisor/duties', () => {
    const items = [
      entry({ facility: 'Memorial', supervisorName: 'Dr. House' }),
      entry({ facility: 'Lakeside', duties: ['vitals', 'charting'] }),
    ];
    expect(filterBySearch(items, 'house')).toHaveLength(1);
    expect(filterBySearch(items, 'charting')).toHaveLength(1);
    expect(filterBySearch(items, '')).toHaveLength(2);
    expect(filterBySearch(items, 'zzz')).toHaveLength(0);
  });
});

describe('formatHours', () => {
  it('trims trailing zeros', () => {
    expect(formatHours(4)).toBe('4');
    expect(formatHours(3.5)).toBe('3.5');
    expect(formatHours(2.25)).toBe('2.25');
  });
});

describe('toSortedRows', () => {
  it('sorts descending by value', () => {
    expect(toSortedRows({ a: 1, b: 9, c: 5 })).toEqual([
      { key: 'b', value: 9 },
      { key: 'c', value: 5 },
      { key: 'a', value: 1 },
    ]);
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM', () => {
    expect(monthLabel('2026-02')).toBe('Feb 2026');
  });
  it('passes through bad input', () => {
    expect(monthLabel('nope')).toBe('nope');
  });
});

describe('benchmarkProgress', () => {
  it('returns null without a positive target', () => {
    expect(benchmarkProgress(87, undefined)).toBeNull();
    expect(benchmarkProgress(87, 0)).toBeNull();
  });
  it('computes capped percent and remaining', () => {
    expect(benchmarkProgress(87, 150)).toEqual({ pct: 58, remaining: 63 });
    expect(benchmarkProgress(200, 150)).toEqual({ pct: 100, remaining: 0 });
  });
});

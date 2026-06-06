import { describe, expect, it } from 'vitest';
import type { Activity } from './types';
import {
  buildMonthGrid,
  canSetPrivate,
  filterBySearch,
  groupByDate,
  monthLabel,
  reflectionPromptFor,
  REFLECTION_PROMPTS,
  sortByDateDesc,
  toSortedRows,
  weekIndexOf,
} from './logic';

const act = (over: Partial<Activity>): Activity => ({
  activityId: Math.random().toString(36).slice(2),
  userId: 'keira',
  date: '2026-01-15',
  category: 'volunteer',
  title: 't',
  visibility: 'family',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('reflection prompts', () => {
  it('rotates deterministically and stays within the prompt list', () => {
    const a = reflectionPromptFor('2026-01-05');
    const b = reflectionPromptFor('2026-01-12'); // one week later
    expect(REFLECTION_PROMPTS).toContain(a);
    expect(REFLECTION_PROMPTS).toContain(b);
    expect(reflectionPromptFor('2026-01-05')).toBe(a); // stable for the same week
  });

  it('weekIndexOf advances by 1 across 7 days', () => {
    expect(weekIndexOf('2026-01-12') - weekIndexOf('2026-01-05')).toBe(1);
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
  it('orders newest first without mutating the input', () => {
    const input = [act({ date: '2026-01-01' }), act({ date: '2026-03-01' }), act({ date: '2026-02-01' })];
    const sorted = sortByDateDesc(input);
    expect(sorted.map((a) => a.date)).toEqual(['2026-03-01', '2026-02-01', '2026-01-01']);
    expect(input[0]?.date).toBe('2026-01-01'); // original untouched
  });
});

describe('groupByDate', () => {
  it('buckets activities by ISO date', () => {
    const grouped = groupByDate([act({ date: '2026-01-01' }), act({ date: '2026-01-01' }), act({ date: '2026-02-01' })]);
    expect(grouped['2026-01-01']).toHaveLength(2);
    expect(grouped['2026-02-01']).toHaveLength(1);
  });
});

describe('filterBySearch', () => {
  const items = [
    act({ title: 'Hospital volunteering', tags: ['CHOC'] }),
    act({ title: 'Soccer practice', subcategory: 'athletics' }),
  ];
  it('matches title, tags, and subcategory; empty query returns all', () => {
    expect(filterBySearch(items, 'hospital')).toHaveLength(1);
    expect(filterBySearch(items, 'choc')).toHaveLength(1);
    expect(filterBySearch(items, 'athlet')).toHaveLength(1);
    expect(filterBySearch(items, '')).toHaveLength(2);
    expect(filterBySearch(items, 'zzz')).toHaveLength(0);
  });
});

describe('buildMonthGrid', () => {
  it('returns 42 cells with the right count inside the month', () => {
    const cells = buildMonthGrid(2026, 1); // February 2026 has 28 days
    expect(cells).toHaveLength(42);
    expect(cells.filter((c) => c.inMonth)).toHaveLength(28);
    expect(cells.some((c) => c.iso === '2026-02-01' && c.inMonth)).toBe(true);
  });
});

describe('toSortedRows + monthLabel', () => {
  it('sorts a record descending by value', () => {
    expect(toSortedRows({ a: 1, b: 5, c: 3 })).toEqual([
      { key: 'b', value: 5 },
      { key: 'c', value: 3 },
      { key: 'a', value: 1 },
    ]);
  });
  it('formats month keys', () => {
    expect(monthLabel('2026-02')).toBe('Feb 2026');
    expect(monthLabel('bad')).toBe('bad');
  });
});

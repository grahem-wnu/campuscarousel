import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import { filterColleges, queryColleges, sortColleges } from './query.js';
import type { ListQuery } from './schema.js';

let seq = 0;
function college(over: Partial<College> = {}): College {
  seq += 1;
  return {
    collegeId: `c${seq}`,
    name: `College ${seq}`,
    createdAt: `2026-01-${String(seq).padStart(2, '0')}T00:00:00Z`,
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const q = (over: Partial<ListQuery> = {}): ListQuery => ({ ...over });

describe('filterColleges', () => {
  it('hides removed colleges unless includeRemoved=true', () => {
    const items = [college({ name: 'Live', status: 'target' }), college({ name: 'Gone', status: 'removed' })];
    expect(filterColleges(items, q()).map((c) => c.name)).toEqual(['Live']);
    expect(filterColleges(items, q({ includeRemoved: 'true' })).map((c) => c.name).sort()).toEqual(['Gone', 'Live']);
  });

  it('filters by status, programType, state, and top-pick', () => {
    const items = [
      college({ name: 'A', status: 'target', programType: 'direct-admit', state: 'Ohio', isTopPick: true }),
      college({ name: 'B', status: 'researching', programType: 'accelerated', state: 'Indiana' }),
    ];
    expect(filterColleges(items, q({ status: 'target' })).map((c) => c.name)).toEqual(['A']);
    expect(filterColleges(items, q({ programType: 'accelerated' })).map((c) => c.name)).toEqual(['B']);
    expect(filterColleges(items, q({ state: 'ohio' })).map((c) => c.name)).toEqual(['A']); // case-insensitive
    expect(filterColleges(items, q({ isTopPick: 'true' })).map((c) => c.name)).toEqual(['A']);
    expect(filterColleges(items, q({ isTopPick: 'false' })).map((c) => c.name)).toEqual(['B']);
  });

  it('searches across name/location/state/notes/ranking', () => {
    const items = [
      college({ name: 'Buckeye U', specialNotes: 'strong clinicals' }),
      college({ name: 'Hoosier U', location: 'Bloomington' }),
    ];
    expect(filterColleges(items, q({ search: 'clinicals' })).map((c) => c.name)).toEqual(['Buckeye U']);
    expect(filterColleges(items, q({ search: 'bloom' })).map((c) => c.name)).toEqual(['Hoosier U']);
    expect(filterColleges(items, q({ search: 'zzz' }))).toHaveLength(0);
  });
});

describe('sortColleges', () => {
  const items = [
    college({ name: 'Bravo', fitScore: 70, tuitionOutOfState: 30000, status: 'researching' }),
    college({ name: 'Alpha', fitScore: 90, tuitionOutOfState: 50000, status: 'accepted' }),
    college({ name: 'Charlie', fitScore: 80, tuitionOutOfState: 20000, status: 'target' }),
  ];

  it('defaults to name ascending', () => {
    expect(sortColleges(items, q()).map((c) => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('puts top picks first, then the chosen sort within each group', () => {
    const mixed = [
      college({ name: 'Bravo' }),
      college({ name: 'Zulu', isTopPick: true }),
      college({ name: 'Alpha', isTopPick: true }),
      college({ name: 'Charlie' }),
    ];
    // picks [Alpha, Zulu] (name asc) above non-picks [Bravo, Charlie] (name asc)
    expect(sortColleges(mixed, q()).map((c) => c.name)).toEqual(['Alpha', 'Zulu', 'Bravo', 'Charlie']);
    // ...and still above non-picks even when a non-pick would otherwise win the sort.
    expect(sortColleges(mixed, q({ sortBy: 'name', sortOrder: 'desc' })).map((c) => c.name)).toEqual(['Zulu', 'Alpha', 'Charlie', 'Bravo']);
  });

  it('sorts by fitScore desc', () => {
    expect(sortColleges(items, q({ sortBy: 'fitScore', sortOrder: 'desc' })).map((c) => c.name)).toEqual([
      'Alpha',
      'Charlie',
      'Bravo',
    ]);
  });

  it('sorts by tuition asc', () => {
    expect(sortColleges(items, q({ sortBy: 'tuition' })).map((c) => c.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by status (pipeline order: accepted before target before researching)', () => {
    expect(sortColleges(items, q({ sortBy: 'status' })).map((c) => c.name)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });
});

describe('queryColleges', () => {
  it('filters then sorts in one pass', () => {
    const items = [
      college({ name: 'Keep1', status: 'target', fitScore: 60 }),
      college({ name: 'Drop', status: 'removed', fitScore: 99 }),
      college({ name: 'Keep2', status: 'target', fitScore: 80 }),
    ];
    const out = queryColleges(items, q({ status: 'target', sortBy: 'fitScore', sortOrder: 'desc' }));
    expect(out.map((c) => c.name)).toEqual(['Keep2', 'Keep1']);
  });
});

// Pure-logic tests for the Scholarships tab: dropdown grouping, the display labels, and the busy
// predicates that decide which of the tab's five states renders.

import { describe, expect, it } from 'vitest';
import {
  amountLabel,
  CATEGORY_ORDER,
  COMPETITIVENESS_LABEL,
  COMPETITIVENESS_TONE,
  emptyMessage,
  groupByCategory,
  hasResearch,
  lastRunLabel,
  researchBusy,
  scholarshipMeta,
  searchBusy,
  searchScopeLabel,
} from './logic';
import type { CollegeScholarship, ScholarshipSearchState } from './types';

const award = (over: Partial<CollegeScholarship> = {}): CollegeScholarship => ({
  collegeId: 'c1',
  scholarshipId: Math.random().toString(36).slice(2),
  name: 'An Award',
  ...over,
});

describe('groupByCategory', () => {
  it('groups into academic / athletic / other, in that order', () => {
    const groups = groupByCategory([
      award({ name: 'Rowing', category: 'athletic' }),
      award({ name: 'Merit', category: 'academic' }),
      award({ name: 'Misc', category: 'other' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(CATEGORY_ORDER);
  });

  it('omits a group with nothing in it', () => {
    const groups = groupByCategory([award({ category: 'academic' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Academic');
  });

  it('treats a missing category as "other" rather than dropping the award', () => {
    const groups = groupByCategory([award({ name: 'Unlabeled' })]);
    expect(groups[0]?.category).toBe('other');
    expect(groups[0]?.items).toHaveLength(1);
  });

  it('sorts within a group by name so the dropdown is stable across reloads', () => {
    const groups = groupByCategory([
      award({ name: 'Zeta', category: 'academic' }),
      award({ name: 'Alpha', category: 'academic' }),
    ]);
    expect(groups[0]?.items.map((s) => s.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('amountLabel', () => {
  it('formats a real figure with separators', () => {
    expect(amountLabel({ amount: 12000 })).toBe('$12,000');
  });

  it('falls back to the prose description', () => {
    expect(amountLabel({ amountDescription: 'Full tuition' })).toBe('Full tuition');
  });

  it('prefers the figure when both are present', () => {
    expect(amountLabel({ amount: 500, amountDescription: 'varies' })).toBe('$500');
  });

  it('is null when there is nothing to say (and ignores a zero amount)', () => {
    expect(amountLabel({})).toBeNull();
    expect(amountLabel({ amount: 0 })).toBeNull();
  });
});

describe('scholarshipMeta', () => {
  it('assembles the meta line in a stable order', () => {
    expect(scholarshipMeta(award({ amount: 5000, deadline: '2026-11-01', renewable: true, sport: 'Rowing' }))).toEqual([
      '$5,000',
      'Due 2026-11-01',
      'Renewable',
      'Rowing',
    ]);
  });

  it('omits everything unknown, and does not claim "Renewable" when it is explicitly false', () => {
    expect(scholarshipMeta(award({ renewable: false }))).toEqual([]);
  });
});

describe('busy predicates', () => {
  const state = (status: ScholarshipSearchState['status']): ScholarshipSearchState => ({ collegeId: 'c1', status });

  it('searchBusy covers pending and in-progress only', () => {
    expect(searchBusy(state('pending'))).toBe(true);
    expect(searchBusy(state('in-progress'))).toBe(true);
    expect(searchBusy(state('complete'))).toBe(false);
    expect(searchBusy(state('failed'))).toBe(false);
    expect(searchBusy(null)).toBe(false);
  });

  it('researchBusy covers pending and in-progress only', () => {
    expect(researchBusy(award({ researchStatus: 'in-progress' }))).toBe(true);
    expect(researchBusy(award({ researchStatus: 'complete' }))).toBe(false);
    expect(researchBusy(award())).toBe(false);
    expect(researchBusy(null)).toBe(false);
  });
});

describe('hasResearch', () => {
  it('is true only for a dossier with something in it', () => {
    expect(hasResearch(award({ research: { summary: 'x' } }))).toBe(true);
    expect(hasResearch(award({ research: {} }))).toBe(false);
    expect(hasResearch(award())).toBe(false);
    expect(hasResearch(null)).toBe(false);
  });
});

describe('lastRunLabel', () => {
  it('formats a timestamp', () => {
    expect(lastRunLabel('2026-08-20T12:00:00.000Z')).toMatch(/2026/);
  });

  it('degrades to the raw value rather than showing "Invalid Date"', () => {
    expect(lastRunLabel('not a date')).toBe('not a date');
  });

  it('is null when there is no timestamp', () => {
    expect(lastRunLabel(undefined)).toBeNull();
  });
});

describe('emptyMessage', () => {
  it('distinguishes "never searched" from "found nothing"', () => {
    expect(emptyMessage(null, 'all')).toContain('No search has been run');
    const ran: ScholarshipSearchState = { collegeId: 'c1', status: 'complete', lastRunAt: '2026-08-20T00:00:00Z' };
    expect(emptyMessage(ran, 'all')).toContain('didn’t turn up');
  });

  it('names the category it searched', () => {
    const ran: ScholarshipSearchState = { collegeId: 'c1', status: 'complete', lastRunAt: '2026-08-20T00:00:00Z' };
    expect(emptyMessage(ran, 'athletic')).toContain('athletic');
  });
});

describe('competitiveness display', () => {
  it('labels and tones every value, and keeps the encouraging one positive', () => {
    for (const key of Object.keys(COMPETITIVENESS_LABEL) as (keyof typeof COMPETITIVENESS_LABEL)[]) {
      expect(COMPETITIVENESS_LABEL[key]).toBeTruthy();
      expect(COMPETITIVENESS_TONE[key]).toBeTruthy();
    }
    expect(COMPETITIVENESS_TONE.accessible).toBe('success');
    expect(COMPETITIVENESS_TONE['very-high']).toBe('error');
  });
});

describe('searchScopeLabel', () => {
  const ran = (over: Partial<ScholarshipSearchState> = {}): ScholarshipSearchState => ({
    collegeId: 'c1',
    status: 'complete',
    lastRunAt: '2026-08-20T00:00:00Z',
    ...over,
  });

  it('quotes what the family typed', () => {
    expect(searchScopeLabel(ran({ query: 'soccer' }))).toBe('“soccer”');
  });

  it('describes a broad sweep in plain words', () => {
    expect(searchScopeLabel(ran({ category: 'all' }))).toBe('all scholarships');
    expect(searchScopeLabel(ran())).toBe('all scholarships');
  });

  it('names the scope for a category-only search', () => {
    expect(searchScopeLabel(ran({ category: 'athletic' }))).toBe('athletic scholarships');
  });

  it('is null before anything has ever run, so the tab shows no stale scope line', () => {
    expect(searchScopeLabel(null)).toBeNull();
    expect(searchScopeLabel({ collegeId: 'c1', status: 'pending' })).toBeNull();
  });
});

describe('emptyMessage with a query', () => {
  it('blames the search term, not the school — only one of those means try other words', () => {
    const state: ScholarshipSearchState = {
      collegeId: 'c1',
      status: 'complete',
      lastRunAt: '2026-08-20T00:00:00Z',
      query: 'underwater basket weaving',
    };
    expect(emptyMessage(state, 'all')).toContain('“underwater basket weaving”');
  });
});

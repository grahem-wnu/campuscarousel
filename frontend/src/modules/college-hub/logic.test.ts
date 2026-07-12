import { describe, expect, it } from 'vitest';
import {
  acceptanceValue,
  anyFetchingAssets,
  anyHydrating,
  bestCost,
  bulletize,
  campusImageSrc,
  checklistPct,
  compactCost,
  costLabel,
  domainOf,
  firstPercent,
  fitBand,
  gpaValue,
  hydrationMeta,
  logoSrc,
  normalizeName,
  rankValue,
  untrackedCandidates,
} from './logic';
import type { College } from './types';

function college(over: Partial<College> = {}): College {
  return {
    collegeId: 'c1',
    name: 'Ohio State',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('hydrationMeta', () => {
  it('flags in-flight refreshes as busy and healthy as none', () => {
    expect(hydrationMeta('in-progress')?.busy).toBe(true);
    expect(hydrationMeta('pending')?.busy).toBe(true);
    expect(hydrationMeta('failed')).toMatchObject({ tone: 'error', busy: false });
    expect(hydrationMeta('partial')).toMatchObject({ tone: 'warn' });
    expect(hydrationMeta('complete')).toBeNull();
    expect(hydrationMeta(undefined)).toBeNull();
  });
});

describe('anyHydrating', () => {
  it('is true when any college is queued or refreshing', () => {
    expect(anyHydrating([college({ hydrationStatus: 'complete' }), college({ hydrationStatus: 'in-progress' })])).toBe(true);
    expect(anyHydrating([college({ hydrationStatus: 'complete' })])).toBe(false);
  });
});

describe('costLabel / bestCost', () => {
  it('formats costs and picks the most net-relevant figure', () => {
    expect(costLabel(0)).toBe('Free');
    expect(costLabel(undefined)).toBe('');
    expect(costLabel(42000)).toBe('$42,000');
    // bestCost is an ANNUAL figure: real net price wins, then full COA, then tuition. The 4-year
    // fields (estimatedTotalCost/estimatedCostAfterAid) are intentionally ignored here.
    expect(
      bestCost(college({ estimatedNetPriceAfterAid: 19000, costOfAttendanceOutOfState: 58000, tuitionOutOfState: 40000 })),
    ).toBe(19000);
    expect(bestCost(college({ costOfAttendanceOutOfState: 58000, tuitionOutOfState: 40000 }))).toBe(58000);
    expect(bestCost(college({ tuitionOutOfState: 40000, estimatedCostAfterAid: 22000 }))).toBe(40000);
    expect(bestCost(college({ tuitionInState: 12000 }))).toBe(12000);
    expect(bestCost(college())).toBeUndefined();
  });
});

describe('domainOf / logoSrc', () => {
  it('extracts a bare domain', () => {
    expect(domainOf('https://www.osu.edu/nursing')).toBe('osu.edu');
    expect(domainOf('indiana.edu')).toBe('indiana.edu');
    expect(domainOf('not a url')).toBeUndefined();
    expect(domainOf(undefined)).toBeUndefined();
  });

  it('prefers branding logo, then the cached logo, then Clearbit, else null', () => {
    expect(logoSrc(college({ branding: { logoUrl: 'https://x/logo.png' } }))).toBe('https://x/logo.png');
    expect(logoSrc(college({ logoImageUrl: 'https://cdn/logo.png', website: 'https://www.osu.edu' }))).toBe('https://cdn/logo.png');
    expect(logoSrc(college({ website: 'https://www.osu.edu' }))).toBe('https://logo.clearbit.com/osu.edu');
    expect(logoSrc(college())).toBeNull();
  });
});

describe('campusImageSrc / anyFetchingAssets', () => {
  it('returns the cached campus url or null', () => {
    expect(campusImageSrc(college({ campusImageUrl: 'https://cdn/campus.jpg' }))).toBe('https://cdn/campus.jpg');
    expect(campusImageSrc(college())).toBeNull();
  });

  it('is true when any college is mid imagery-fetch', () => {
    expect(anyFetchingAssets([college(), college({ assetsStatus: 'in-progress' })])).toBe(true);
    expect(anyFetchingAssets([college({ assetsStatus: 'pending' })])).toBe(true);
    expect(anyFetchingAssets([college({ assetsStatus: 'complete' })])).toBe(false);
  });
});

describe('fitBand', () => {
  it('bands fit scores', () => {
    expect(fitBand(90)?.tone).toBe('success');
    expect(fitBand(70)?.tone).toBe('primary');
    expect(fitBand(45)?.tone).toBe('warn');
    expect(fitBand(20)?.tone).toBe('error');
    expect(fitBand(undefined)).toBeNull();
  });
});

describe('normalizeName / untrackedCandidates', () => {
  it('normalizes consistently with the server', () => {
    expect(normalizeName('  Ohio   State ')).toBe('ohio state');
  });

  it('drops candidates already tracked (case/space-insensitive)', () => {
    const candidates = [{ name: 'Ohio State' }, { name: 'Purdue' }, { name: 'indiana university' }];
    const out = untrackedCandidates(candidates, ['ohio   state', 'Indiana University']);
    expect(out.map((c) => c.name)).toEqual(['Purdue']);
  });
});

describe('checklistPct', () => {
  it('computes completion percent or null when empty', () => {
    expect(checklistPct([{ completed: true }, { completed: false }, { completed: false }, { completed: true }])).toBe(50);
    expect(checklistPct([])).toBeNull();
  });
});

describe('at-a-glance snapshot extractors', () => {
  it('compactCost — k-rounds, Free at zero, null when unknown', () => {
    expect(compactCost(59925)).toBe('$60k');
    expect(compactCost(20257)).toBe('$20k');
    expect(compactCost(0)).toBe('Free');
    expect(compactCost(850)).toBe('$850');
    expect(compactCost(undefined)).toBeNull();
  });

  it('rankValue — pulls the first rank token from a blurb', () => {
    expect(rankValue('Texas A&M University ranks No. 21 among Top Public Schools')).toBe('#21');
    expect(rankValue('UF ranked #5 among public universities nationally (U.S. News 2025)')).toBe('#5');
    expect(rankValue('Oldest continuous CM program (est. 1935); top-rated nationally')).toBeNull();
    expect(rankValue(undefined)).toBeNull();
  });

  it('firstPercent — first percentage, low end of a range', () => {
    expect(firstPercent('~57% overall (Class of 2028)')).toBe('57%');
    expect(firstPercent('~19–20% (Class of 2029)')).toBe('19%');
    expect(firstPercent('99% job placement rate at graduation')).toBe('99%');
    expect(firstPercent('Not published separately for this program')).toBeNull();
  });

  it('gpaValue — first GPA-shaped number on a 0–5 scale', () => {
    expect(gpaValue('~3.66–3.75 weighted GPA (university-wide admitted average)')).toBe('3.66');
    expect(gpaValue('4.5–4.7 weighted (middle 50%, Class of 2029)')).toBe('4.5');
    expect(gpaValue('est. 1935; no GPA reported')).toBeNull();
  });

  it('acceptanceValue — prefers the university rate, falls back to program', () => {
    expect(acceptanceValue(college({ acceptanceRateUniversity: '~57% overall', acceptanceRateProgram: 'Not published' }))).toBe('57%');
    expect(acceptanceValue(college({ acceptanceRateProgram: 'About 30% of applicants admitted' }))).toBe('30%');
    expect(acceptanceValue(college())).toBeNull();
  });
});

describe('bulletize', () => {
  it('splits an enumerated blob into intro + items (handles "(1)" and "1)")', () => {
    const paren = bulletize('HIGHLIGHTS: (1) ACCE-accredited — verify it. (2) Two internships required. (3) OSHA 30 included.');
    expect(paren?.intro).toBe('HIGHLIGHTS:');
    expect(paren?.items).toEqual(['ACCE-accredited — verify it.', 'Two internships required.', 'OSHA 30 included.']);

    const noParen = bulletize('1) First thing here. 2) Second thing here.');
    expect(noParen?.intro).toBe('');
    expect(noParen?.items).toEqual(['First thing here.', 'Second thing here.']);
  });

  it('returns null for non-lists and out-of-order/partial markers (no false positives)', () => {
    expect(bulletize('Just a normal paragraph with no list at all.')).toBeNull();
    expect(bulletize('See note (3) for details, and item (5) elsewhere.')).toBeNull(); // not starting at 1, not consecutive
    expect(bulletize('Tuition is $35,167 (2025-26 approved rates); verify before deciding.')).toBeNull();
  });
});

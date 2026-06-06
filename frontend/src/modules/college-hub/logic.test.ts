import { describe, expect, it } from 'vitest';
import {
  anyHydrating,
  bestCost,
  checklistPct,
  costLabel,
  domainOf,
  fitBand,
  hydrationMeta,
  logoSrc,
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
    expect(bestCost(college({ tuitionOutOfState: 40000, estimatedCostAfterAid: 22000 }))).toBe(22000);
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

  it('prefers branding logo, falls back to Clearbit, else null', () => {
    expect(logoSrc(college({ branding: { logoUrl: 'https://x/logo.png' } }))).toBe('https://x/logo.png');
    expect(logoSrc(college({ website: 'https://www.osu.edu' }))).toBe('https://logo.clearbit.com/osu.edu');
    expect(logoSrc(college())).toBeNull();
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

describe('checklistPct', () => {
  it('computes completion percent or null when empty', () => {
    expect(checklistPct([{ completed: true }, { completed: false }, { completed: false }, { completed: true }])).toBe(50);
    expect(checklistPct([])).toBeNull();
  });
});

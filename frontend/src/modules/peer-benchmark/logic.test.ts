import { describe, expect, it } from 'vitest';
import {
  READINESS_META,
  STATUS_META,
  cellText,
  fmtGpa,
  fmtNum,
  isEmptyMatrix,
  monthLabel,
  readinessMeta,
  severityTone,
  statusMeta,
  summarizeTrend,
  totalGaps,
} from './logic';
import type { BenchmarkSnapshot } from './types';

const snap = (month: string, over: Partial<BenchmarkSnapshot> = {}): BenchmarkSnapshot => ({
  month,
  capturedAt: `${month}-01T00:00:00.000Z`,
  clinicalHours: 0,
  volunteerHours: 0,
  certCount: 0,
  collegesWithData: 1,
  belowGpa: 0,
  belowTeas: 0,
  belowClinicalHours: 0,
  belowVolunteerHours: 0,
  strongCount: 0,
  competitiveCount: 0,
  needsWorkCount: 0,
  ...over,
});

describe('totalGaps', () => {
  it('sums the per-metric below counts', () => {
    expect(totalGaps(snap('2026-06', { belowGpa: 2, belowTeas: 1, belowClinicalHours: 1, belowVolunteerHours: 0 }))).toBe(4);
  });
});

describe('summarizeTrend', () => {
  it('returns null with fewer than two points', () => {
    expect(summarizeTrend([])).toBeNull();
    expect(summarizeTrend([snap('2026-06')])).toBeNull();
  });
  it('reports gaps closing as a negative delta (first vs latest)', () => {
    const s = summarizeTrend([snap('2026-04', { belowGpa: 5 }), snap('2026-06', { belowGpa: 2 })]);
    expect(s?.gapsFrom).toBe(5);
    expect(s?.gapsTo).toBe(2);
    expect(s?.gapsDelta).toBe(-3); // 3 gaps closed
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM as "Mon YYYY"', () => {
    expect(monthLabel('2026-06')).toBe('Jun 2026');
  });
  it('passes through an unparseable value', () => {
    expect(monthLabel('nope')).toBe('nope');
  });
});

describe('readinessMeta', () => {
  it('maps each readiness to a label + tone', () => {
    expect(readinessMeta('strong')).toEqual(READINESS_META.strong);
    expect(readinessMeta('needs-work').label).toBe('Needs Work');
  });
  it('falls back to insufficient-data when undefined', () => {
    expect(readinessMeta(undefined).label).toBe('Insufficient Data');
  });
});

describe('statusMeta — color coding', () => {
  it('greens "above", yellows "at"/meets, reds "below"', () => {
    expect(statusMeta('above').cell).toContain('success');
    expect(statusMeta('at').cell).toContain('warn');
    expect(statusMeta('below').cell).toContain('error');
  });
  it('grays an absent status and not-taken', () => {
    expect(statusMeta(undefined).cell).toContain('ink');
    expect(STATUS_META['not-taken'].cell).toContain('ink');
  });
});

describe('formatting', () => {
  it('fmtGpa keeps two decimals, em-dash when absent', () => {
    expect(fmtGpa(3.8)).toBe('3.80');
    expect(fmtGpa(undefined)).toBe('—');
  });
  it('fmtNum rounds, em-dash when absent', () => {
    expect(fmtNum(85.4)).toBe('85');
    expect(fmtNum(undefined)).toBe('—');
  });
  it('cellText shows keira / school', () => {
    expect(cellText(90, 85)).toBe('90 / 85');
    expect(cellText(3.9, 3.8, true)).toBe('3.90 / 3.80');
    expect(cellText(undefined, 40)).toBe('— / 40');
  });
});

describe('isEmptyMatrix', () => {
  it('is true only with no rows', () => {
    expect(isEmptyMatrix([])).toBe(true);
    expect(isEmptyMatrix([{}])).toBe(false);
  });
});

describe('severityTone', () => {
  it('maps severities to badge tones', () => {
    expect(severityTone('high')).toBe('error');
    expect(severityTone('medium')).toBe('warn');
    expect(severityTone('low')).toBe('neutral');
  });
});

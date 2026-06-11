import { describe, expect, it } from 'vitest';
import {
  BAND_TONE,
  bandOf,
  overallSeries,
  polylinePoints,
  sectionRows,
  targetY,
  trendLabel,
} from './logic';
import type { ProgressPoint } from './types';

const geom = { width: 300, height: 100, pad: 10 };

describe('bandOf / BAND_TONE', () => {
  it('bands and maps to tones', () => {
    expect(bandOf(85)).toBe('strong');
    expect(bandOf(70)).toBe('needs-work');
    expect(bandOf(40)).toBe('critical');
    expect(BAND_TONE[bandOf(85)]).toBe('success');
    expect(BAND_TONE[bandOf(40)]).toBe('error');
  });
});

describe('trendLabel', () => {
  it('phrases up/down/flat/none', () => {
    expect(trendLabel(null)).toMatch(/not enough/i);
    expect(trendLabel(5)).toMatch(/up 5/i);
    expect(trendLabel(-3)).toMatch(/down 3/i);
    expect(trendLabel(0)).toMatch(/flat/i);
  });
});

describe('polylinePoints / targetY', () => {
  it('returns empty for <2 scored points and a polyline otherwise', () => {
    expect(polylinePoints([60], geom)).toBe('');
    const pts = polylinePoints([0, 100], geom).split(' ');
    expect(pts).toHaveLength(2);
    // 0 → bottom (y = pad + innerH), 100 → top (y = pad)
    expect(pts[0]).toBe('10.0,90.0');
    expect(pts[1]).toBe('290.0,10.0');
  });

  it('places the target line correctly', () => {
    expect(targetY(100, geom)).toBeCloseTo(10);
    expect(targetY(0, geom)).toBeCloseTo(90);
  });
});

describe('overallSeries / sectionRows', () => {
  const prog: ProgressPoint[] = [
    { date: '2026-01-01', type: 'practice-test', overallScore: 60, sectionScores: { reading: 60, math: 50, science: 55, englishLanguageUsage: 70 } },
    { date: '2026-02-01', type: 'practice-test', overallScore: 80, sectionScores: { reading: 85, math: 78, science: 70, englishLanguageUsage: 88 } },
  ];
  it('extracts the overall series', () => {
    expect(overallSeries(prog)).toEqual([60, 80]);
  });
  it('builds section rows from the latest point with bands', () => {
    const rows = sectionRows(prog);
    expect(rows.map((r) => r.section)).toEqual(['reading', 'math', 'science', 'englishLanguageUsage']);
    expect(rows.find((r) => r.section === 'science')?.band).toBe('needs-work'); // 70
    expect(rows.find((r) => r.section === 'reading')?.band).toBe('strong'); // 85
  });
});

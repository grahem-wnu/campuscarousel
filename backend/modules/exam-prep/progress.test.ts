import { describe, expect, it } from 'vitest';
import type { ExamScore } from '../../shared/data/index.js';
import {
  band,
  bestOverall,
  cumulativeStudyHours,
  latest,
  overallTrend,
  progression,
  readiness,
  scoredRecords,
  summarize,
  weakSections,
} from './progress.js';

let n = 0;
function rec(over: Partial<ExamScore>): ExamScore {
  n += 1;
  return {
    recordId: `r${n}`,
    type: 'practice-test',
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('scoredRecords / progression', () => {
  it('keeps only scored practice/official records, oldest first', () => {
    const records = [
      rec({ date: '2026-03-01', overallScore: 80 }),
      rec({ type: 'study-session', date: '2026-02-01', studyDuration: 3 }),
      rec({ date: '2026-01-01', overallScore: 60 }),
      rec({ type: 'official-exam', date: '2026-04-01', overallScore: 85 }),
    ];
    expect(scoredRecords(records).map((r) => r.overallScore)).toEqual([60, 80, 85]);
    expect(progression(records).map((p) => p.date)).toEqual(['2026-01-01', '2026-03-01', '2026-04-01']);
  });
});

describe('band', () => {
  it('bands scores by generic reference points', () => {
    expect(band(85)).toBe('strong');
    expect(band(70)).toBe('needs-work');
    expect(band(50)).toBe('critical');
  });
});

describe('latest / bestOverall / overallTrend', () => {
  const records = [
    rec({ date: '2026-01-01', overallScore: 60 }),
    rec({ date: '2026-02-01', overallScore: 72 }),
    rec({ date: '2026-03-01', overallScore: 70 }),
  ];
  it('finds the latest by date, the best, and the first→last trend', () => {
    expect(latest(records)?.overallScore).toBe(70);
    expect(bestOverall(records)).toBe(72);
    expect(overallTrend(records)).toBe(10); // 70 - 60
  });
  it('trend is null with fewer than two scored records', () => {
    expect(overallTrend([rec({ overallScore: 60 })])).toBeNull();
  });
});

describe('weakSections', () => {
  it('returns latest-record sections below the threshold, weakest first', () => {
    const records = [
      rec({ date: '2026-02-01', overallScore: 70, sectionScores: { reading: 85, math: 55, science: 60, englishLanguageUsage: 90 } }),
    ];
    expect(weakSections(records)).toEqual(['math', 'science']); // 55 < 60, weakest first
  });
});

describe('cumulativeStudyHours', () => {
  it('sums study-session durations only', () => {
    const records = [
      rec({ type: 'study-session', studyDuration: 2 }),
      rec({ type: 'study-session', studyDuration: 3 }),
      rec({ overallScore: 80 }),
    ];
    expect(cumulativeStudyHours(records)).toBe(5);
  });
});

describe('summarize', () => {
  it('rolls up attempts, latest/best, trend, hours, weak sections, and bands', () => {
    const records = [
      rec({ date: '2026-01-01', overallScore: 60, sectionScores: { reading: 60, math: 50, science: 55, englishLanguageUsage: 70 } }),
      rec({ date: '2026-02-01', overallScore: 75, sectionScores: { reading: 80, math: 65, science: 70, englishLanguageUsage: 82 } }),
      rec({ type: 'study-session', studyDuration: 4 }),
    ];
    const s = summarize(records);
    expect(s.attempts).toBe(2);
    expect(s.latestOverall).toBe(75);
    expect(s.bestOverall).toBe(75);
    expect(s.trend).toBe(15);
    expect(s.cumulativeStudyHours).toBe(4);
    expect(s.weakSections).toEqual(['math', 'science']); // reading 80 ≥ 78 → not weak
    expect(s.sectionBands.englishLanguageUsage).toBe('strong');
    expect(s.sectionBands.math).toBe('needs-work');
  });
});

describe('readiness', () => {
  it('reports ready, close, or below against the target', () => {
    expect(readiness([rec({ overallScore: 80 })], 78).ready).toBe(true);
    expect(readiness([rec({ overallScore: 75 })], 78)).toMatchObject({ ready: false, gap: 3 });
    expect(readiness([rec({ overallScore: 60 })], 78).gap).toBe(18);
    expect(readiness([], 78).gap).toBeNull();
  });
});

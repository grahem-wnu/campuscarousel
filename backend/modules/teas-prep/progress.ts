// Pure TEAS progression + readiness logic. Framework- and AWS-free so it unit-tests for real. The
// data layer returns the raw records; these helpers shape them for charts and drive the AI prompts.

import type { Teas } from '../../shared/data/index.js';
import { SECTIONS } from './schema.js';

export type Section = (typeof SECTIONS)[number];

/** Human labels for the four sections (shared by the AI prompts and the handlers). */
export const SECTION_LABEL: Record<Section, string> = {
  reading: 'Reading',
  math: 'Math',
  science: 'Science',
  englishLanguageUsage: 'English & Language Usage',
};

/** Score records that contribute to progression — practice tests and official exams (not study
 *  sessions, which have no score), oldest → newest. */
export function scoredRecords(records: readonly Teas[]): Teas[] {
  return records
    .filter((r) => (r.type === 'practice-test' || r.type === 'official-exam') && r.overallScore !== undefined)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface ProgressPoint {
  date: string;
  type: Teas['type'];
  overallScore?: number;
  sectionScores: Record<Section, number | undefined>;
}

/** A chart-ready progression series (overall + each section over time). */
export function progression(records: readonly Teas[]): ProgressPoint[] {
  return scoredRecords(records).map((r) => ({
    date: r.date,
    type: r.type,
    overallScore: r.overallScore,
    sectionScores: {
      reading: r.sectionScores?.reading,
      math: r.sectionScores?.math,
      science: r.sectionScores?.science,
      englishLanguageUsage: r.sectionScores?.englishLanguageUsage,
    },
  }));
}

/** The most recent scored record, or null. */
export function latest(records: readonly Teas[]): Teas | null {
  const s = scoredRecords(records);
  return s.length ? s[s.length - 1]! : null;
}

/** Best overall score across scored records, or null. */
export function bestOverall(records: readonly Teas[]): number | null {
  const scores = scoredRecords(records).map((r) => r.overallScore!).filter((n) => n !== undefined);
  return scores.length ? Math.max(...scores) : null;
}

/** Proficiency band for a section/overall score (TEAS national reference points). */
export type Band = 'strong' | 'needs-work' | 'critical';
export function band(score: number): Band {
  if (score >= 78) return 'strong'; // ~Advanced
  if (score >= 59) return 'needs-work'; // ~Proficient
  return 'critical';
}

/** Sections of the latest record at or below the needs-work threshold, weakest first. */
export function weakSections(records: readonly Teas[], threshold = 78): Section[] {
  const last = latest(records);
  if (!last?.sectionScores) return [];
  return SECTIONS.filter((s) => {
    const v = last.sectionScores?.[s];
    return v !== undefined && v < threshold;
  }).sort((a, b) => (last.sectionScores![a] ?? 0) - (last.sectionScores![b] ?? 0));
}

/** Cumulative study hours logged across study-session records. */
export function cumulativeStudyHours(records: readonly Teas[]): number {
  return records
    .filter((r) => r.type === 'study-session')
    .reduce((sum, r) => sum + (r.studyDuration ?? 0), 0);
}

/** Improvement (latest minus first scored overall), or null with <2 scored records. */
export function overallTrend(records: readonly Teas[]): number | null {
  const s = scoredRecords(records);
  if (s.length < 2) return null;
  const first = s[0]!.overallScore;
  const last = s[s.length - 1]!.overallScore;
  if (first === undefined || last === undefined) return null;
  return Math.round((last - first) * 10) / 10;
}

export interface ProgressSummary {
  attempts: number;
  latestOverall: number | null;
  bestOverall: number | null;
  trend: number | null;
  cumulativeStudyHours: number;
  weakSections: Section[];
  sectionBands: Partial<Record<Section, Band>>;
}

/** Roll up everything GET /teas/progress returns for the dashboard + charts. */
export function summarize(records: readonly Teas[]): ProgressSummary {
  const last = latest(records);
  const sectionBands: Partial<Record<Section, Band>> = {};
  for (const s of SECTIONS) {
    const v = last?.sectionScores?.[s];
    if (v !== undefined) sectionBands[s] = band(v);
  }
  return {
    attempts: scoredRecords(records).length,
    latestOverall: last?.overallScore ?? null,
    bestOverall: bestOverall(records),
    trend: overallTrend(records),
    cumulativeStudyHours: cumulativeStudyHours(records),
    weakSections: weakSections(records),
    sectionBands,
  };
}

/** Simple readiness heuristic against a target score (default 78 ≈ competitive BSN). */
export function readiness(records: readonly Teas[], targetScore = 78): {
  ready: boolean;
  gap: number | null;
  message: string;
} {
  const last = latest(records);
  if (!last || last.overallScore === undefined) {
    return { ready: false, gap: null, message: 'Log a practice test to gauge readiness.' };
  }
  const gap = Math.round((targetScore - last.overallScore) * 10) / 10;
  if (gap <= 0) return { ready: true, gap, message: `At or above your ${targetScore} target — keep it sharp.` };
  if (gap <= 5) return { ready: false, gap, message: `Close — about ${gap} points to your ${targetScore} target.` };
  return { ready: false, gap, message: `${gap} points below your ${targetScore} target; focus the weak sections.` };
}

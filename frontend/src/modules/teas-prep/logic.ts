// Pure, framework-free helpers for the TEAS Prep UI. Unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type { Band, ProgressPoint, Section, TeasType } from './types';

export const SECTION_LABEL: Record<Section, string> = {
  reading: 'Reading',
  math: 'Math',
  science: 'Science',
  englishLanguageUsage: 'English & Language',
};
export const SECTIONS_ORDER: Section[] = ['reading', 'math', 'science', 'englishLanguageUsage'];

export const TYPE_LABEL: Record<TeasType, string> = {
  'practice-test': 'Practice test',
  'study-session': 'Study session',
  'official-exam': 'Official exam',
};

/** Color-coding from the spec: green strong / yellow needs-work / red critical. */
export function bandOf(score: number): Band {
  if (score >= 78) return 'strong';
  if (score >= 59) return 'needs-work';
  return 'critical';
}
export const BAND_TONE: Record<Band, BadgeTone> = {
  strong: 'success',
  'needs-work': 'warn',
  critical: 'error',
};
/** Bar fill class per band (used by the section breakdown bars). */
export const BAND_BAR: Record<Band, string> = {
  strong: 'bg-success-500',
  'needs-work': 'bg-warn-500',
  critical: 'bg-error-500',
};

export function trendLabel(trend: number | null): string {
  if (trend === null) return 'Not enough attempts to trend';
  if (trend > 0) return `Up ${trend} pts since your first attempt`;
  if (trend < 0) return `Down ${Math.abs(trend)} pts since your first attempt`;
  return 'Flat since your first attempt';
}

export interface ChartGeom {
  width: number;
  height: number;
  pad: number;
}

/** Map a score series to an SVG polyline `points` string within the chart box (0–100 → y inverted).
 *  Returns '' for fewer than two points (a single point renders as a dot elsewhere). */
export function polylinePoints(scores: readonly (number | undefined)[], geom: ChartGeom): string {
  const pts = scores
    .map((s, i) => ({ s, i }))
    .filter((p): p is { s: number; i: number } => typeof p.s === 'number');
  if (pts.length < 2) return '';
  const { width, height, pad } = geom;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = scores.length > 1 ? innerW / (scores.length - 1) : 0;
  return pts
    .map(({ s, i }) => {
      const x = pad + i * stepX;
      const y = pad + innerH * (1 - Math.max(0, Math.min(100, s)) / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Horizontal y for a target line (e.g. 78) inside the chart box. */
export function targetY(target: number, geom: ChartGeom): number {
  const innerH = geom.height - geom.pad * 2;
  return geom.pad + innerH * (1 - Math.max(0, Math.min(100, target)) / 100);
}

/** Overall-score series from a progression (undefined entries kept so the x-axis stays aligned). */
export function overallSeries(progression: readonly ProgressPoint[]): (number | undefined)[] {
  return progression.map((p) => p.overallScore);
}

/** Section breakdown rows from the latest progression point. */
export function sectionRows(progression: readonly ProgressPoint[]): { section: Section; label: string; score?: number; band?: Band }[] {
  const last = progression.at(-1);
  return SECTIONS_ORDER.map((section) => {
    const score = last?.sectionScores[section];
    return { section, label: SECTION_LABEL[section], score, band: score !== undefined ? bandOf(score) : undefined };
  });
}

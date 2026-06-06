// Pure, framework-free helpers for the Peer Benchmark UI. Kept out of the React components so they
// can be unit-tested in the node environment (the repo has no jsdom; the logic is what's tested).

import type { BadgeTone } from '../../shared/ui';
import type { Readiness, TeasStatus } from './types';

export interface ReadinessMeta {
  label: string;
  tone: BadgeTone;
}

/** Readiness badge labels + tones (Strong Match / Competitive / Needs Work / Insufficient Data). */
export const READINESS_META: Record<Readiness, ReadinessMeta> = {
  strong: { label: 'Strong Match', tone: 'success' },
  competitive: { label: 'Competitive', tone: 'primary' },
  'needs-work': { label: 'Needs Work', tone: 'warn' },
  'insufficient-data': { label: 'Insufficient Data', tone: 'neutral' },
};

export function readinessMeta(r: Readiness | undefined): ReadinessMeta {
  return READINESS_META[r ?? 'insufficient-data'];
}

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** Matrix cell tint (green exceeds / yellow meets / red below / gray no-data). */
  cell: string;
}

const NO_DATA: StatusMeta = { label: 'No data', tone: 'neutral', cell: 'bg-ink-50 text-ink-500' };

/** Per-metric status → label, badge tone, and the color-coded matrix cell class. */
export const STATUS_META: Record<TeasStatus, StatusMeta> = {
  above: { label: 'Above', tone: 'success', cell: 'bg-success-50 text-success-800' },
  at: { label: 'Meets', tone: 'warn', cell: 'bg-warn-50 text-warn-800' },
  below: { label: 'Below', tone: 'error', cell: 'bg-error-50 text-error-800' },
  'not-taken': { label: 'Not taken', tone: 'neutral', cell: 'bg-ink-50 text-ink-500' },
};

/** Status metadata for a (possibly absent) metric status; absent → gray "no data". */
export function statusMeta(status: TeasStatus | undefined): StatusMeta {
  return status ? STATUS_META[status] : NO_DATA;
}

/** Format a GPA to two decimals, an em-dash when absent. */
export function fmtGpa(n: number | undefined): string {
  return typeof n === 'number' ? n.toFixed(2) : '—';
}

/** Format a whole-number metric (TEAS, hours), an em-dash when absent. */
export function fmtNum(n: number | undefined): string {
  return typeof n === 'number' ? String(Math.round(n)) : '—';
}

/** "keira / school" cell text for the matrix. */
export function cellText(keira: number | undefined, school: number | undefined, gpa = false): string {
  const f = gpa ? fmtGpa : fmtNum;
  return `${f(keira)} / ${f(school)}`;
}

/** Whether the aggregate has at least one college to compare against. */
export function isEmptyMatrix(rows: readonly unknown[]): boolean {
  return rows.length === 0;
}

const SEVERITY_TONE: Record<'high' | 'medium' | 'low', BadgeTone> = {
  high: 'error',
  medium: 'warn',
  low: 'neutral',
};

export function severityTone(severity: 'high' | 'medium' | 'low'): BadgeTone {
  return SEVERITY_TONE[severity];
}

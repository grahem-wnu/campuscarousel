// Pure, framework-free helpers for the Campus Visit Planner UI. Kept out of the React components so
// they can be unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type { Visit, VisitType, WouldAttend } from './types';

const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  'campus-tour': 'Campus Tour',
  'nursing-dept-visit': 'Nursing Dept Visit',
  'open-house': 'Open House',
  'admitted-student-day': 'Admitted Student Day',
  overnight: 'Overnight',
  virtual: 'Virtual',
};

export function visitTypeLabel(t: VisitType | undefined): string {
  return t ? VISIT_TYPE_LABELS[t] : 'Visit';
}

const WOULD_ATTEND_LABELS: Record<WouldAttend, string> = {
  yes: 'Would attend',
  no: 'Would not attend',
  maybe: 'Maybe',
  undecided: 'Undecided',
};

export function wouldAttendLabel(w: WouldAttend | undefined): string | undefined {
  return w ? WOULD_ATTEND_LABELS[w] : undefined;
}

/** Badge tone for a would-attend rating. */
export function wouldAttendTone(w: WouldAttend | undefined): BadgeTone {
  return w === 'yes' ? 'success' : w === 'no' ? 'error' : w === 'maybe' ? 'warn' : 'neutral';
}

/** Newest first, breaking ties by creation time. Returns a new array. */
export function sortVisitsByDateDesc(visits: readonly Visit[]): Visit[] {
  return [...visits].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** A visit counts as "completed" (debriefed) once it has impressions or a would-attend rating. */
export function isCompleted(visit: Visit): boolean {
  return Boolean(visit.impressions?.trim() || visit.wouldAttend);
}

/** The most recent COMPLETED visit date for the "Visited on [date]" badge, or null if none. */
export function visitedOn(visits: readonly Visit[]): string | null {
  const completed = visits.filter(isCompleted).map((v) => v.date).sort();
  return completed.length > 0 ? completed[completed.length - 1]! : null;
}

/** Total logged travel cost across visits (ignores entries without a cost). */
export function totalTravelCost(visits: readonly Visit[]): number {
  return visits.reduce((sum, v) => sum + (typeof v.travelCost === 'number' ? v.travelCost : 0), 0);
}

export interface ComparisonRow {
  visitId: string;
  date: string;
  type: string;
  wouldAttend?: WouldAttend;
  pros: number;
  cons: number;
  travelCost?: number;
}

/** Build a compact multi-visit comparison (one row per completed visit, newest first). */
export function buildComparison(visits: readonly Visit[]): ComparisonRow[] {
  return sortVisitsByDateDesc(visits.filter(isCompleted)).map((v) => ({
    visitId: v.visitId,
    date: v.date,
    type: visitTypeLabel(v.visitType),
    wouldAttend: v.wouldAttend,
    pros: v.pros?.length ?? 0,
    cons: v.cons?.length ?? 0,
    travelCost: v.travelCost,
  }));
}

/** Format a USD amount compactly (no cents when whole). */
export function formatCost(n: number): string {
  return n % 1 === 0 ? `$${n.toLocaleString('en-US')}` : `$${n.toFixed(2)}`;
}

// Progress-over-time for Peer Benchmark (spec Module 16 — "monthly snapshot of gaps closing"). Pure
// functions: turn the current aggregate into one month's snapshot and merge it into the rolling
// history (one entry per calendar month, newest last, capped). No AWS, no request — unit-tested.

import type { BenchmarkSnapshot } from '../../shared/data/index.js';
import type { KeiraStats } from './stats.js';
import type { MatrixRow } from './compare.js';

/** The 'YYYY-MM' month an ISO timestamp falls in. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

const MAX_SNAPSHOTS = 24; // two years of monthly points — plenty for a trend, bounded storage.

/** Build the snapshot for `month` from the student's stats + the current aggregate rows. */
export function buildSnapshot(
  month: string,
  capturedAt: string,
  keira: KeiraStats,
  rows: readonly MatrixRow[],
): BenchmarkSnapshot {
  const withData = rows.filter((r) => r.benchmark.hasData);
  const below = (pick: (r: MatrixRow) => string | undefined): number =>
    withData.filter((r) => pick(r) === 'below').length;
  const readiness = (kind: string): number =>
    withData.filter((r) => r.comparison.overallReadiness === kind).length;

  return {
    month,
    capturedAt,
    gpa: keira.gpa,
    teasScore: keira.teasScore,
    clinicalHours: keira.clinicalHours,
    volunteerHours: keira.volunteerHours,
    certCount: keira.certifications.length,
    collegesWithData: withData.length,
    belowGpa: below((r) => r.comparison.gpaStatus),
    belowTeas: below((r) => r.comparison.teasStatus),
    belowClinicalHours: below((r) => r.comparison.clinicalHoursStatus),
    belowVolunteerHours: below((r) => r.comparison.volunteerHoursStatus),
    strongCount: readiness('strong'),
    competitiveCount: readiness('competitive'),
    needsWorkCount: readiness('needs-work'),
  };
}

/** Merge a snapshot into the history: replace any existing entry for the same month (so re-loading
 *  the dashboard refreshes the current month rather than duplicating it), keep newest-last order,
 *  and cap to the most recent {@link MAX_SNAPSHOTS}. */
export function mergeSnapshot(
  existing: readonly BenchmarkSnapshot[],
  snap: BenchmarkSnapshot,
): BenchmarkSnapshot[] {
  const others = existing.filter((s) => s.month !== snap.month);
  const next = [...others, snap].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return next.slice(-MAX_SNAPSHOTS);
}

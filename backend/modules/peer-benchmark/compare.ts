// Pure comparison logic: turn Keira's stats + a college's benchmark into per-metric status
// indicators and an overall readiness verdict, and build the all-colleges aggregate matrix. No AWS,
// no request — unit-tested in compare.test.ts.

import type { Benchmark, College } from '../../shared/data/index.js';
import type { KeiraStats } from './stats.js';

export type MetricStatus = 'above' | 'at' | 'below';
export type Readiness = 'strong' | 'competitive' | 'needs-work' | 'insufficient-data';

/** The shape stored on `Benchmark.keirasComparison`. */
export type Comparison = NonNullable<Benchmark['keirasComparison']>;

/** Three-way compare with a tolerance band around the target ("at" = within tolerance). */
function tri(actual: number | undefined, target: number | undefined, tol: number): MetricStatus | undefined {
  if (actual === undefined || target === undefined) return undefined;
  if (actual >= target + tol) return 'above';
  if (actual <= target - tol) return 'below';
  return 'at';
}

/** Whether a benchmark carries any competitive numbers at all (else: insufficient data). */
export function hasBenchmarkData(b: Benchmark | null | undefined): boolean {
  if (!b) return false;
  return (
    typeof b.avgGPAAdmitted === 'number' ||
    typeof b.avgTEASScore === 'number' ||
    typeof b.typicalClinicalHours === 'number' ||
    typeof b.typicalVolunteerHours === 'number'
  );
}

/**
 * Derive an overall readiness from the per-metric statuses. "below" counts against, "above"/"at"
 * count for; an unknown metric is ignored. Insufficient data when the benchmark has no numbers or
 * fewer than two metrics are comparable.
 */
export function computeReadiness(
  statuses: readonly (MetricStatus | 'not-taken' | undefined)[],
  benchmark: Benchmark | null | undefined,
): Readiness {
  if (!hasBenchmarkData(benchmark)) return 'insufficient-data';
  const comparable = statuses.filter(
    (s): s is MetricStatus => s === 'above' || s === 'at' || s === 'below',
  );
  if (comparable.length < 2) return 'insufficient-data';
  const below = comparable.filter((s) => s === 'below').length;
  const meetsOrExceeds = comparable.length - below;
  if (below === 0) return 'strong';
  if (meetsOrExceeds >= below) return 'competitive';
  return 'needs-work';
}

/** Compute the full `keirasComparison` for a college's benchmark from Keira's current stats. */
export function compareToBenchmark(stats: KeiraStats, benchmark: Benchmark | null | undefined): Comparison {
  const gpaStatus = tri(stats.gpa, benchmark?.avgGPAAdmitted, 0.05);
  const teasStatus: MetricStatus | 'not-taken' | undefined =
    stats.teasScore === undefined ? 'not-taken' : tri(stats.teasScore, benchmark?.avgTEASScore, 1);
  const clinicalHoursStatus = tri(stats.clinicalHours, benchmark?.typicalClinicalHours, 5);
  const volunteerHoursStatus = tri(stats.volunteerHours, benchmark?.typicalVolunteerHours, 5);

  const comparison: Comparison = {
    overallReadiness: computeReadiness(
      [gpaStatus, teasStatus, clinicalHoursStatus, volunteerHoursStatus],
      benchmark,
    ),
  };
  if (gpaStatus) comparison.gpaStatus = gpaStatus;
  if (teasStatus) comparison.teasStatus = teasStatus;
  if (clinicalHoursStatus) comparison.clinicalHoursStatus = clinicalHoursStatus;
  if (volunteerHoursStatus) comparison.volunteerHoursStatus = volunteerHoursStatus;
  return comparison;
}

/** Points a per-metric status is worth toward the 0-100 fit score. */
const FIT_POINTS = { above: 100, at: 80, below: 35 } as const;

/**
 * The spec's auto-calculated `College.fitScore` (0-100): how the student's profile stacks up against
 * this college's typical-admit requirements. Derived from the same per-metric comparison that drives
 * readiness — above=100, at=80, below=35 — averaged over the comparable metrics. A TEAS exam the
 * program reports but the student hasn't taken counts as a gap. Undefined (no score yet) until at
 * least two metrics are comparable, matching the 'insufficient-data' readiness threshold — so a
 * brand-new profile honestly shows "no fit score yet" rather than a fabricated number.
 */
export function computeFitScore(stats: KeiraStats, benchmark: Benchmark | null | undefined): number | undefined {
  if (!hasBenchmarkData(benchmark)) return undefined;
  const c = compareToBenchmark(stats, benchmark);
  const pts: number[] = [];
  const add = (s: MetricStatus | undefined): void => {
    if (s) pts.push(FIT_POINTS[s]);
  };
  add(c.gpaStatus);
  if (c.teasStatus === 'not-taken') {
    if (typeof benchmark?.avgTEASScore === 'number') pts.push(FIT_POINTS.below); // expected but missing → a gap
  } else {
    add(c.teasStatus);
  }
  add(c.clinicalHoursStatus);
  add(c.volunteerHoursStatus);
  if (pts.length < 2) return undefined;
  return Math.round(pts.reduce((a, b) => a + b, 0) / pts.length);
}

/** One college's row in the aggregate matrix. */
export interface MatrixRow {
  collegeId: string;
  collegeName: string;
  isTopPick?: boolean;
  benchmark: {
    avgGPAAdmitted?: number;
    avgTEASScore?: number;
    typicalClinicalHours?: number;
    typicalVolunteerHours?: number;
    typicalCertifications?: string[];
    lastDataRefresh?: string;
    hasData: boolean;
  };
  comparison: Comparison;
}

/** The aggregate response: Keira's stats plus a row per college (school typical vs Keira). */
export interface AggregateMatrix {
  keira: KeiraStats;
  rows: MatrixRow[];
}

export function buildAggregate(
  stats: KeiraStats,
  colleges: readonly College[],
  benchmarkOf: (collegeId: string) => Benchmark | null | undefined,
): AggregateMatrix {
  const rows = colleges.map((college): MatrixRow => {
    const b = benchmarkOf(college.collegeId);
    return {
      collegeId: college.collegeId,
      collegeName: college.name,
      isTopPick: college.isTopPick,
      benchmark: {
        avgGPAAdmitted: b?.avgGPAAdmitted,
        avgTEASScore: b?.avgTEASScore,
        typicalClinicalHours: b?.typicalClinicalHours,
        typicalVolunteerHours: b?.typicalVolunteerHours,
        typicalCertifications: b?.typicalCertifications,
        lastDataRefresh: b?.lastDataRefresh,
        hasData: hasBenchmarkData(b),
      },
      comparison: compareToBenchmark(stats, b),
    };
  });
  return { keira: stats, rows };
}

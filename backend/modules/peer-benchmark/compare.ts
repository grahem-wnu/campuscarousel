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

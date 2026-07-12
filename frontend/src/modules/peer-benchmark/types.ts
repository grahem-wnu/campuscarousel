// Frontend types for Peer Benchmark. These mirror the API responses (the backend's data shapes) —
// the frontend has no access to the backend data-layer package, so the contract is restated here
// and kept in sync via the API.

export type MetricStatus = 'above' | 'at' | 'below';
export type TeasStatus = MetricStatus | 'not-taken';
export type Readiness = 'strong' | 'competitive' | 'needs-work' | 'insufficient-data';

export interface KeiraStats {
  gpa?: number;
  teasScore?: number;
  clinicalHours: number;
  volunteerHours: number;
  certifications: string[];
}

export interface Comparison {
  gpaStatus?: MetricStatus;
  teasStatus?: TeasStatus;
  clinicalHoursStatus?: MetricStatus;
  volunteerHoursStatus?: MetricStatus;
  overallReadiness?: Readiness;
}

export interface Benchmark {
  collegeId: string;
  avgGPAAdmitted?: number;
  avgTEASScore?: number;
  avgSATScore?: number;
  typicalClinicalHours?: number;
  typicalVolunteerHours?: number;
  typicalCertifications?: string[];
  typicalExtracurriculars?: string;
  competitiveEdges?: string[];
  keirasComparison?: Comparison;
  hydrationStatus?: 'pending' | 'in-progress' | 'complete' | 'partial' | 'failed';
  lastDataRefresh?: string;
  createdAt: string;
  updatedAt: string;
}

/** GET/POST /colleges/:id/benchmark — per-college detail. */
/** Major-aware labels for the benchmark metrics. `exam` is the entrance-exam name (e.g. "TEAS"),
 *  omitted when the major has no standardized entrance exam — that metric is then hidden. `experience`
 *  labels the hands-on-hours metric (nursing → "Clinical hours", construction → "Internship hours"). */
export interface BenchmarkLabels {
  exam?: string;
  experience: string;
}

/** Sensible default when an older response predates the major-aware labels. */
export const DEFAULT_BENCHMARK_LABELS: BenchmarkLabels = { exam: 'Entrance exam', experience: 'Experience hours' };

export interface BenchmarkDetail {
  college: { collegeId: string; name: string };
  benchmark: Benchmark | null;
  keira: KeiraStats;
  comparison: Comparison;
  labels?: BenchmarkLabels;
}

/** A college's row in the aggregate matrix. */
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

/** One month's point-in-time snapshot of competitive readiness (progress over time). */
export interface BenchmarkSnapshot {
  month: string; // 'YYYY-MM'
  capturedAt: string;
  gpa?: number;
  teasScore?: number;
  clinicalHours: number;
  volunteerHours: number;
  certCount: number;
  collegesWithData: number;
  belowGpa: number;
  belowTeas: number;
  belowClinicalHours: number;
  belowVolunteerHours: number;
  strongCount: number;
  competitiveCount: number;
  needsWorkCount: number;
}

/** GET /benchmarks/aggregate. */
export interface AggregateMatrix {
  keira: KeiraStats;
  rows: MatrixRow[];
  /** Monthly snapshots, oldest → newest (one per calendar month). */
  trend: BenchmarkSnapshot[];
  labels?: BenchmarkLabels;
}

export interface Gap {
  metric: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

/** GET /benchmarks/gaps. */
export interface GapsAnalysis {
  keira: KeiraStats;
  summary: string;
  gaps: Gap[];
}

/** Optional steer for a refresh. */
export interface RefreshInput {
  focus?: string;
}

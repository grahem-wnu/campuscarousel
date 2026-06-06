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
  lastDataRefresh?: string;
  createdAt: string;
  updatedAt: string;
}

/** GET/POST /colleges/:id/benchmark — per-college detail. */
export interface BenchmarkDetail {
  college: { collegeId: string; name: string };
  benchmark: Benchmark | null;
  keira: KeiraStats;
  comparison: Comparison;
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

/** GET /benchmarks/aggregate. */
export interface AggregateMatrix {
  keira: KeiraStats;
  rows: MatrixRow[];
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

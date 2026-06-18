import { describe, expect, it } from 'vitest';
import type { Benchmark, College } from '../../shared/data/index.js';
import {
  buildAggregate,
  compareToBenchmark,
  computeFitScore,
  computeReadiness,
  hasBenchmarkData,
} from './compare.js';
import type { KeiraStats } from './stats.js';

const bench = (over: Partial<Benchmark>): Benchmark =>
  ({ collegeId: 'c1', createdAt: '', updatedAt: '', ...over }) as Benchmark;

const stats = (over: Partial<KeiraStats> = {}): KeiraStats => ({
  clinicalHours: 0,
  volunteerHours: 0,
  certifications: [],
  ...over,
});

describe('hasBenchmarkData', () => {
  it('is false for null or an empty benchmark', () => {
    expect(hasBenchmarkData(null)).toBe(false);
    expect(hasBenchmarkData(bench({}))).toBe(false);
  });
  it('is true once any competitive number is present', () => {
    expect(hasBenchmarkData(bench({ avgGPAAdmitted: 3.8 }))).toBe(true);
  });
});

describe('compareToBenchmark', () => {
  it('marks each metric above/at/below with a tolerance band', () => {
    const c = compareToBenchmark(
      stats({ gpa: 3.9, teasScore: 90, clinicalHours: 50, volunteerHours: 100 }),
      bench({ avgGPAAdmitted: 3.8, avgTEASScore: 85, typicalClinicalHours: 100, typicalVolunteerHours: 100 }),
    );
    expect(c.gpaStatus).toBe('above');
    expect(c.teasStatus).toBe('above');
    expect(c.clinicalHoursStatus).toBe('below');
    expect(c.volunteerHoursStatus).toBe('at'); // within the ±5h band
  });

  it('reports teasStatus "not-taken" when she has no TEAS score', () => {
    const c = compareToBenchmark(stats({ gpa: 3.9 }), bench({ avgGPAAdmitted: 3.8, avgTEASScore: 85 }));
    expect(c.teasStatus).toBe('not-taken');
  });

  it('omits a status when the benchmark lacks that metric', () => {
    const c = compareToBenchmark(stats({ gpa: 3.9, clinicalHours: 50 }), bench({ avgGPAAdmitted: 3.8 }));
    expect(c.gpaStatus).toBe('above');
    expect(c.clinicalHoursStatus).toBeUndefined();
  });
});

describe('computeReadiness', () => {
  it('is insufficient-data without benchmark numbers', () => {
    expect(computeReadiness(['above', 'above'], null)).toBe('insufficient-data');
    expect(computeReadiness(['above', 'above'], bench({}))).toBe('insufficient-data');
  });
  it('is insufficient-data when fewer than two metrics are comparable', () => {
    expect(computeReadiness(['above', 'not-taken', undefined], bench({ avgGPAAdmitted: 3.8 }))).toBe('insufficient-data');
  });
  it('is strong when nothing is below', () => {
    expect(computeReadiness(['above', 'at'], bench({ avgGPAAdmitted: 3.8 }))).toBe('strong');
  });
  it('is competitive when meets-or-exceeds ties or beats below-count', () => {
    expect(computeReadiness(['above', 'below'], bench({ avgGPAAdmitted: 3.8 }))).toBe('competitive');
  });
  it('is needs-work when below dominates', () => {
    expect(computeReadiness(['below', 'below', 'at'], bench({ avgGPAAdmitted: 3.8 }))).toBe('needs-work');
  });
});

describe('buildAggregate', () => {
  const college = (over: Partial<College>): College =>
    ({ collegeId: 'c', name: 'College', createdAt: '', updatedAt: '', ...over }) as College;

  it('produces a row per college with benchmark + comparison, and echoes Keira stats', () => {
    const colleges = [college({ collegeId: 'c1', name: 'UCLA', isTopPick: true }), college({ collegeId: 'c2', name: 'CSULB' })];
    const benches = new Map<string, Benchmark | null>([
      ['c1', bench({ collegeId: 'c1', avgGPAAdmitted: 3.8, avgTEASScore: 85, typicalClinicalHours: 40, typicalVolunteerHours: 40 })],
      ['c2', null],
    ]);
    const s = stats({ gpa: 3.9, teasScore: 90, clinicalHours: 50, volunteerHours: 50 });
    const matrix = buildAggregate(s, colleges, (id) => benches.get(id) ?? null);

    expect(matrix.keira).toEqual(s);
    expect(matrix.rows).toHaveLength(2);
    const ucla = matrix.rows[0]!;
    expect(ucla).toMatchObject({ collegeId: 'c1', collegeName: 'UCLA', isTopPick: true });
    expect(ucla.benchmark.hasData).toBe(true);
    expect(ucla.comparison.overallReadiness).toBe('strong');
    const csulb = matrix.rows[1]!;
    expect(csulb.benchmark.hasData).toBe(false);
    expect(csulb.comparison.overallReadiness).toBe('insufficient-data');
  });
});

describe('computeFitScore', () => {
  const fullBench = bench({
    avgGPAAdmitted: 3.5,
    avgTEASScore: 80,
    typicalClinicalHours: 100,
    typicalVolunteerHours: 50,
  });

  it('is undefined without benchmark data', () => {
    expect(computeFitScore(stats({ gpa: 4 }), null)).toBeUndefined();
    expect(computeFitScore(stats({ gpa: 4 }), bench({}))).toBeUndefined();
  });
  it('is undefined with fewer than two comparable metrics', () => {
    // Only GPA is comparable (no hours/TEAS targets on the benchmark).
    expect(computeFitScore(stats({ gpa: 4 }), bench({ avgGPAAdmitted: 3.5 }))).toBeUndefined();
  });
  it('is 100 when the student exceeds every metric', () => {
    expect(
      computeFitScore(stats({ gpa: 4.0, teasScore: 95, clinicalHours: 300, volunteerHours: 200 }), fullBench),
    ).toBe(100);
  });
  it('treats a not-taken-but-expected exam and zero hours as gaps (35)', () => {
    expect(computeFitScore(stats(), fullBench)).toBe(35);
  });
  it('blends strengths and gaps into a mid-range score', () => {
    // GPA above (100), TEAS not taken (35), clinical below (35), volunteer below (35) → 51.
    expect(computeFitScore(stats({ gpa: 4.0 }), fullBench)).toBe(51);
  });
});

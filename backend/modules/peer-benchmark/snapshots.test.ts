import { describe, expect, it } from 'vitest';
import { buildSnapshot, mergeSnapshot, monthOf } from './snapshots.js';
import type { KeiraStats } from './stats.js';
import type { MatrixRow } from './compare.js';

const keira: KeiraStats = { gpa: 3.8, teasScore: 80, clinicalHours: 120, volunteerHours: 40, certifications: ['BLS', 'CNA'] };

function row(partial: Partial<MatrixRow> & { hasData: boolean; readiness?: MatrixRow['comparison']['overallReadiness']; below?: Partial<MatrixRow['comparison']> }): MatrixRow {
  return {
    collegeId: partial.collegeId ?? 'c1',
    collegeName: partial.collegeName ?? 'College',
    benchmark: { hasData: partial.hasData },
    comparison: { overallReadiness: partial.readiness, ...partial.below },
  };
}

describe('monthOf', () => {
  it('extracts YYYY-MM from an ISO timestamp', () => {
    expect(monthOf('2026-06-14T09:30:00.000Z')).toBe('2026-06');
  });
});

describe('buildSnapshot', () => {
  it('captures the student stats and counts gaps + readiness across colleges with data', () => {
    const rows: MatrixRow[] = [
      row({ collegeId: 'a', hasData: true, readiness: 'strong', below: {} }),
      row({ collegeId: 'b', hasData: true, readiness: 'needs-work', below: { gpaStatus: 'below', clinicalHoursStatus: 'below' } }),
      row({ collegeId: 'c', hasData: true, readiness: 'competitive', below: { teasStatus: 'below' } }),
      row({ collegeId: 'd', hasData: false }), // no benchmark data — excluded from counts
    ];
    const s = buildSnapshot('2026-06', '2026-06-14T00:00:00.000Z', keira, rows);
    expect(s.month).toBe('2026-06');
    expect(s.gpa).toBe(3.8);
    expect(s.certCount).toBe(2);
    expect(s.collegesWithData).toBe(3);
    expect(s.belowGpa).toBe(1);
    expect(s.belowTeas).toBe(1);
    expect(s.belowClinicalHours).toBe(1);
    expect(s.belowVolunteerHours).toBe(0);
    expect(s.strongCount).toBe(1);
    expect(s.competitiveCount).toBe(1);
    expect(s.needsWorkCount).toBe(1);
  });
});

describe('mergeSnapshot', () => {
  const snap = (month: string, gpa: number): ReturnType<typeof buildSnapshot> =>
    buildSnapshot(month, `${month}-01T00:00:00.000Z`, { ...keira, gpa }, []);

  it('appends a new month and keeps chronological order', () => {
    const merged = mergeSnapshot([snap('2026-04', 3.5)], snap('2026-05', 3.6));
    expect(merged.map((s) => s.month)).toEqual(['2026-04', '2026-05']);
  });

  it('replaces the same month rather than duplicating (idempotent re-load)', () => {
    const merged = mergeSnapshot([snap('2026-05', 3.5)], snap('2026-05', 3.9));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.gpa).toBe(3.9);
  });

  it('caps history to the most recent 24 months', () => {
    let history: ReturnType<typeof buildSnapshot>[] = [];
    for (let m = 1; m <= 30; m++) history = mergeSnapshot(history, snap(`2026-${String(m).padStart(2, '0')}`, 3));
    expect(history).toHaveLength(24);
    expect(history[0]?.month).toBe('2026-07'); // first 6 dropped
    expect(history[history.length - 1]?.month).toBe('2026-30');
  });
});

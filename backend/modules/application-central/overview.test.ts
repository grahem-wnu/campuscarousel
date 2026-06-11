import { describe, expect, it } from 'vitest';
import type { College, Essay, ExamScore } from '../../shared/data/index.js';
import { buildOverview } from './overview.js';

const TODAY = '2026-06-06';

let n = 0;
function college(over: Partial<College>): College {
  n += 1;
  return { collegeId: `c${n}`, name: `College ${n}`, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over };
}
const essay = (over: Partial<Essay>): Essay => ({ essayId: `e${(n += 1)}`, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over });

describe('buildOverview', () => {
  it('derives per-college rows with deadline countdown, essay progress, and exam-score presence', () => {
    const colleges = [
      college({ collegeId: 'osu', name: 'Ohio State', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01' } }),
      college({ collegeId: 'iu', name: 'Indiana', status: 'target', applicationDeadlines: { earlyAction: '2026-07-01' } }),
      college({ collegeId: 'gone', name: 'Removed U', status: 'removed' }),
    ];
    const essays: Essay[] = [
      essay({ collegeId: 'osu', status: 'final' }),
      essay({ collegeId: 'osu', status: 'drafting' }),
    ];
    const exams: ExamScore[] = [{ recordId: 't1', type: 'practice-test', date: '2026-05-01', overallScore: 72, createdAt: 'x', updatedAt: 'x' }];

    const rows = buildOverview(colleges, essays, exams, TODAY);

    expect(rows.map((r) => r.collegeId)).toEqual(['iu', 'osu']); // removed hidden; soonest deadline first
    const iu = rows[0]!;
    expect(iu.nextDeadline).toEqual({ label: 'Early action', date: '2026-07-01' });
    expect(iu.daysUntilDeadline).toBe(25);
    expect(iu.essays.total).toBe(0);
    expect(iu.hasExamScore).toBe(true);

    const osu = rows[1]!;
    expect(osu.essays).toEqual({ total: 2, final: 1, statuses: ['final', 'drafting'] });
  });

  it('sorts colleges without deadlines last and reports no exam score', () => {
    const rows = buildOverview(
      [college({ collegeId: 'a', name: 'Aaa' }), college({ collegeId: 'b', name: 'Bbb', applicationDeadlines: { regularDecision: '2026-09-01' } })],
      [],
      [],
      TODAY,
    );
    expect(rows.map((r) => r.collegeId)).toEqual(['b', 'a']);
    expect(rows[0]?.hasExamScore).toBe(false);
  });
});

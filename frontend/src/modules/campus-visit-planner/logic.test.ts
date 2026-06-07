import { describe, expect, it } from 'vitest';
import {
  buildComparison,
  formatCost,
  isCompleted,
  sortVisitsByDateDesc,
  totalTravelCost,
  visitedOn,
  visitTypeLabel,
  wouldAttendLabel,
  wouldAttendTone,
} from './logic';
import type { Visit } from './types';

const visit = (over: Partial<Visit> = {}): Visit => ({
  collegeId: 'uci',
  visitId: Math.random().toString(36).slice(2),
  date: '2026-04-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('labels & tones', () => {
  it('visitTypeLabel', () => {
    expect(visitTypeLabel('open-house')).toBe('Open House');
    expect(visitTypeLabel(undefined)).toBe('Visit');
  });
  it('wouldAttendLabel', () => {
    expect(wouldAttendLabel('yes')).toBe('Would attend');
    expect(wouldAttendLabel(undefined)).toBeUndefined();
  });
  it('wouldAttendTone', () => {
    expect(wouldAttendTone('yes')).toBe('success');
    expect(wouldAttendTone('no')).toBe('error');
    expect(wouldAttendTone('maybe')).toBe('warn');
    expect(wouldAttendTone(undefined)).toBe('neutral');
  });
});

describe('sortVisitsByDateDesc', () => {
  it('orders newest first', () => {
    const out = sortVisitsByDateDesc([
      visit({ visitId: 'a', date: '2026-01-01' }),
      visit({ visitId: 'b', date: '2026-03-01' }),
    ]);
    expect(out.map((v) => v.visitId)).toEqual(['b', 'a']);
  });
});

describe('isCompleted / visitedOn', () => {
  it('a visit is completed once it has impressions or a rating', () => {
    expect(isCompleted(visit())).toBe(false);
    expect(isCompleted(visit({ impressions: 'nice' }))).toBe(true);
    expect(isCompleted(visit({ wouldAttend: 'yes' }))).toBe(true);
  });
  it('visitedOn returns the latest completed date, else null', () => {
    expect(visitedOn([visit({ date: '2026-01-01' })])).toBeNull(); // not completed
    expect(
      visitedOn([
        visit({ date: '2026-01-01', wouldAttend: 'yes' }),
        visit({ date: '2026-05-01', impressions: 'great' }),
        visit({ date: '2026-09-01' }), // not completed → ignored
      ]),
    ).toBe('2026-05-01');
  });
});

describe('totalTravelCost / formatCost', () => {
  it('sums travel costs, ignoring missing', () => {
    expect(totalTravelCost([visit({ travelCost: 300 }), visit({ travelCost: 150 }), visit({})])).toBe(450);
  });
  it('formats USD', () => {
    expect(formatCost(1200)).toBe('$1,200');
    expect(formatCost(99.5)).toBe('$99.50');
  });
});

describe('buildComparison', () => {
  it('includes only completed visits, newest first, with pro/con counts', () => {
    const rows = buildComparison([
      visit({ visitId: 'a', date: '2026-01-01', wouldAttend: 'yes', pros: ['x', 'y'], cons: ['z'] }),
      visit({ visitId: 'b', date: '2026-03-01', impressions: 'ok' }),
      visit({ visitId: 'c', date: '2026-09-01' }), // not completed
    ]);
    expect(rows.map((r) => r.visitId)).toEqual(['b', 'a']);
    const a = rows.find((r) => r.visitId === 'a')!;
    expect(a.pros).toBe(2);
    expect(a.cons).toBe(1);
  });
});

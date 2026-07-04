import { describe, expect, it } from 'vitest';
import { categoryRows, deadlineLabel, deadlineTone, formatDeadlineDate, gpaText, money, READINESS_LABEL, READINESS_TONE, readinessLabel, totalColleges } from './logic';
import type { Deadline } from './types';

const dl = (daysUntil: number, date = '2026-12-01'): Deadline => ({ source: 'college', label: 'x', date, daysUntil });

describe('deadlineTone / deadlineLabel', () => {
  it('escalates by urgency and phrases the countdown', () => {
    expect(deadlineTone(3)).toBe('error');
    expect(deadlineTone(20)).toBe('warn');
    expect(deadlineTone(90)).toBe('neutral');
    expect(deadlineLabel(dl(0))).toBe('today');
    expect(deadlineLabel(dl(1))).toBe('tomorrow');
    expect(deadlineLabel(dl(10))).toBe('in 10d');
    // Beyond the relative window, a compact human date (not the raw ISO) that won't wrap on mobile.
    expect(deadlineLabel(dl(90, '2028-10-01'))).toBe('Oct 1, 2028');
  });
});

describe('formatDeadlineDate', () => {
  it('renders an ISO date as a compact, timezone-stable human date', () => {
    expect(formatDeadlineDate('2028-10-01')).toBe('Oct 1, 2028');
    expect(formatDeadlineDate('2026-01-31')).toBe('Jan 31, 2026');
  });
  it('returns the input unchanged when it is not an ISO date', () => {
    expect(formatDeadlineDate('rolling')).toBe('rolling');
    expect(formatDeadlineDate('2028-13-01')).toBe('2028-13-01'); // invalid month → untouched
  });
});

describe('money / gpaText', () => {
  it('formats money and gpa', () => {
    expect(money(80000)).toBe('$80,000');
    expect(money(null)).toBe('—');
    expect(gpaText(3.75, 3.5)).toBe('3.75 (uw 3.50)');
    expect(gpaText(4, 4)).toBe('4.00');
    expect(gpaText(null, null)).toBe('—');
  });
});

describe('categoryRows / totalColleges', () => {
  it('sorts categories by hours desc and totals colleges', () => {
    expect(categoryRows({ volunteer: 8, clinical: 3 }).map((r) => r.category)).toEqual(['volunteer', 'clinical']);
    expect(totalColleges({ target: 2, applying: 1 })).toBe(3);
  });
});

describe('readinessLabel', () => {
  it('humanizes every readiness level (no raw enums reach the badge)', () => {
    expect(readinessLabel('strong')).toBe('Strong');
    expect(readinessLabel('competitive')).toBe('Competitive');
    expect(readinessLabel('needs-work')).toBe('Needs work');
    expect(readinessLabel('insufficient-data')).toBe('Not enough data yet');
  });

  it('covers the same levels as the tone map and falls back to the input', () => {
    for (const level of Object.keys(READINESS_TONE)) {
      expect(READINESS_LABEL[level], `label missing for ${level}`).toBeTruthy();
    }
    expect(readinessLabel('mystery')).toBe('mystery');
  });
});

import { describe, expect, it } from 'vitest';
import { categoryRows, deadlineLabel, deadlineTone, gpaText, money, totalColleges } from './logic';
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
    expect(deadlineLabel(dl(90, '2026-12-01'))).toBe('2026-12-01');
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

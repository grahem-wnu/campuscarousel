import { describe, expect, it } from 'vitest';
import { countdownLabel, daysUntil, kindLabel, statusLabel } from './logic';

describe('labels', () => {
  it('humanizes kinds and statuses', () => {
    expect(kindLabel('css-profile')).toBe('CSS Profile');
    expect(statusLabel('not-started')).toBe('Not started');
  });
});

describe('daysUntil / countdownLabel', () => {
  it('computes day deltas', () => {
    expect(daysUntil('2029-01-11', '2029-01-01')).toBe(10);
    expect(daysUntil('2028-12-29', '2029-01-01')).toBe(-3);
  });
  it('formats human countdowns', () => {
    expect(countdownLabel('2029-01-02', '2029-01-01')).toBe('tomorrow');
    expect(countdownLabel('2029-01-01', '2029-01-01')).toBe('today');
    expect(countdownLabel('2028-12-30', '2029-01-01')).toBe('2 days ago');
  });
});

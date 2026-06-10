import { describe, expect, it } from 'vitest';
import { dayName, hourLabel, validateRecipients } from './logic';

describe('dayName', () => {
  it('maps 0-6 to weekday names', () => {
    expect(dayName(0)).toBe('Sunday');
    expect(dayName(1)).toBe('Monday');
    expect(dayName(6)).toBe('Saturday');
  });
});

describe('hourLabel', () => {
  it('zero-pads the UTC hour', () => {
    expect(hourLabel(9)).toBe('09:00 UTC');
    expect(hourLabel(13)).toBe('13:00 UTC');
  });
});

describe('validateRecipients', () => {
  it('flags a missing name and a bad email', () => {
    const errs = validateRecipients([{ label: '', email: 'nope', includePrivate: false }]);
    expect(errs).toHaveLength(2);
  });
  it('passes valid recipients', () => {
    expect(
      validateRecipients([{ label: 'Mom', email: 'kate.cuthbertson@gmail.com', includePrivate: false }]),
    ).toHaveLength(0);
  });
});

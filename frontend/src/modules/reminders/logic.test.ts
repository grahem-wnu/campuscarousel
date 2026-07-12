import { describe, expect, it } from 'vitest';
import { dayName, localHourFromUtc, utcHourFromLocal, localHourLabel, validateRecipients } from './logic';

describe('dayName', () => {
  it('maps 0-6 to weekday names', () => {
    expect(dayName(0)).toBe('Sunday');
    expect(dayName(1)).toBe('Monday');
    expect(dayName(6)).toBe('Saturday');
  });
});

describe('local/UTC hour conversion', () => {
  // US Pacific Daylight Time: UTC-7, so getTimezoneOffset() = 420.
  const PDT = 420;
  it('converts a stored UTC hour to the local clock hour', () => {
    expect(localHourFromUtc(13, PDT)).toBe(6); // 13:00 UTC = 6am PDT
    expect(localHourFromUtc(2, PDT)).toBe(19); // wraps backwards across midnight
  });
  it('converts a chosen local hour back to UTC', () => {
    expect(utcHourFromLocal(6, PDT)).toBe(13);
    expect(utcHourFromLocal(19, PDT)).toBe(2);
  });
  it('round-trips for every hour', () => {
    for (let h = 0; h < 24; h++) expect(localHourFromUtc(utcHourFromLocal(h, PDT), PDT)).toBe(h);
  });
  it('is identity at UTC (offset 0)', () => {
    expect(localHourFromUtc(9, 0)).toBe(9);
    expect(utcHourFromLocal(9, 0)).toBe(9);
  });
});

describe('localHourLabel', () => {
  it('renders a human local time string', () => {
    const s = localHourLabel(9);
    expect(s).toMatch(/9:00/); // exact tz suffix depends on the runner's timezone
  });
});

describe('validateRecipients', () => {
  it('flags a missing name and a bad email', () => {
    const errs = validateRecipients([{ label: '', email: 'nope' }]);
    expect(errs).toHaveLength(2);
  });
  it('passes valid recipients', () => {
    expect(validateRecipients([{ label: 'Mom', email: 'kate.cuthbertson@gmail.com' }])).toHaveLength(0);
  });
});

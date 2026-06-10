import { describe, expect, it } from 'vitest';
import type { ReminderSettings } from '../../shared/data/index.js';
import { DEFAULT_SETTINGS, effectiveSettings, shouldSendNow } from './settings.js';

const base = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...DEFAULT_SETTINGS,
  recipients: [{ label: 'Mom', email: 'mom@example.com', includePrivate: false }],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});
const at = (iso: string): Date => new Date(iso);

describe('effectiveSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(effectiveSettings(null)).toMatchObject({ enabled: true, cadence: 'weekly', recipients: [] });
  });
  it('returns the stored record when present', () => {
    const s = base();
    expect(effectiveSettings(s)).toBe(s);
  });
});

describe('shouldSendNow', () => {
  // 2026-06-15T13:00Z is a Monday (getUTCDay() === 1) at the default send hour.
  it('weekly: fires on the configured hour + weekday', () => {
    expect(shouldSendNow(base(), at('2026-06-15T13:00:00Z'))).toBe(true);
  });
  it('skips the wrong hour', () => {
    expect(shouldSendNow(base(), at('2026-06-15T12:00:00Z'))).toBe(false);
  });
  it('weekly: skips the wrong weekday', () => {
    expect(shouldSendNow(base(), at('2026-06-16T13:00:00Z'))).toBe(false); // Tuesday
  });
  it('daily: fires any day on the hour', () => {
    expect(shouldSendNow(base({ cadence: 'daily' }), at('2026-06-16T13:00:00Z'))).toBe(true);
  });
  it('skips when disabled', () => {
    expect(shouldSendNow(base({ enabled: false }), at('2026-06-15T13:00:00Z'))).toBe(false);
  });
  it('skips when there are no recipients', () => {
    expect(shouldSendNow(base({ recipients: [] }), at('2026-06-15T13:00:00Z'))).toBe(false);
  });
  it('guards against a second send the same UTC day', () => {
    expect(
      shouldSendNow(base({ lastSentAt: '2026-06-15T13:00:00.000Z' }), at('2026-06-15T13:00:00Z')),
    ).toBe(false);
  });
});

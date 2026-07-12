// Pure reminder-settings helpers: the defaults the UI shows before anything is saved, and the
// scheduling gate the digest Lambda uses. Framework- and AWS-free so it unit-tests for real.

import type { ReminderSettings } from '../../shared/data/index.js';

export type SettingsInput = Omit<ReminderSettings, 'createdAt' | 'updatedAt'>;

/** What a brand-new family sees before saving anything: a Monday-morning weekly digest, 30-day
 *  horizon, no recipients yet (so nothing sends until at least one address is added). */
export const DEFAULT_SETTINGS: SettingsInput = {
  enabled: true,
  cadence: 'weekly',
  sendHourUTC: 13, // ~6-9am across US timezones
  weeklyDayOfWeek: 1, // Monday
  horizonDays: 30,
  recipients: [],
};

/** Settings to render/operate on whether or not a record exists yet. */
export function effectiveSettings(stored: ReminderSettings | null): ReminderSettings | SettingsInput {
  return stored ?? { ...DEFAULT_SETTINGS };
}

/**
 * Should the scheduled digest fire on this tick? The EventBridge schedule fires hourly; this gates
 * to the configured UTC hour (and, for weekly cadence, the configured weekday), requires at least
 * one recipient, and guards against a double-send within the same UTC day if the Lambda is retried.
 */
export function shouldSendNow(s: ReminderSettings, now: Date): boolean {
  if (!s.enabled) return false;
  if (!s.recipients.some((r) => r.email)) return false;
  if (now.getUTCHours() !== s.sendHourUTC) return false;
  if (s.cadence === 'weekly' && now.getUTCDay() !== s.weeklyDayOfWeek) return false;
  if (s.lastSentAt && s.lastSentAt.slice(0, 10) === now.toISOString().slice(0, 10)) return false;
  return true;
}

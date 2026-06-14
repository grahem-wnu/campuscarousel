// Pure helpers for the Reminders settings page — formatting + recipient validation. Unit-tested.

import type { ReminderRecipient } from './types';

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function dayName(d: number): string {
  return DAY_NAMES[d] ?? String(d);
}

// --- Send time: stored as a UTC hour (the scheduler fires on a fixed UTC hour), but shown and
// chosen in the user's LOCAL time, because nobody thinks in UTC. We convert at the UI boundary.
// `getTimezoneOffset()` returns minutes to ADD to local to get UTC (e.g. +420 for US Pacific),
// rounded to the nearest hour for the hour-granularity dropdown.

function offsetHours(offsetMinutes: number): number {
  return Math.round(offsetMinutes / 60);
}

/** The local clock hour (0-23) that a stored UTC hour corresponds to, in the browser's timezone. */
export function localHourFromUtc(utcHour: number, offsetMinutes: number = new Date().getTimezoneOffset()): number {
  return ((utcHour - offsetHours(offsetMinutes)) % 24 + 24) % 24;
}

/** The UTC hour to store for a chosen local clock hour (0-23), in the browser's timezone. */
export function utcHourFromLocal(localHour: number, offsetMinutes: number = new Date().getTimezoneOffset()): number {
  return ((localHour + offsetHours(offsetMinutes)) % 24 + 24) % 24;
}

/** Format a 0-23 LOCAL hour for the dropdown, e.g. "6:00 AM PDT" (time + timezone from the browser). */
export function localHourLabel(localHour: number, at: Date = new Date()): string {
  const d = new Date(at);
  d.setHours(localHour, 0, 0, 0);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tz = new Intl.DateTimeFormat([], { hour: 'numeric', timeZoneName: 'short' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  return tz ? `${time} ${tz}` : time;
}

export interface RecipientError {
  index: number;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate recipients before save: each needs a non-empty label and a valid email. */
export function validateRecipients(recipients: readonly ReminderRecipient[]): RecipientError[] {
  const errors: RecipientError[] = [];
  recipients.forEach((r, index) => {
    if (!r.label.trim()) errors.push({ index, message: 'Name is required' });
    if (!EMAIL.test(r.email)) errors.push({ index, message: 'Enter a valid email' });
  });
  return errors;
}

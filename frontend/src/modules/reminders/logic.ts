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

/** Format a 0-23 UTC hour as "13:00 UTC". */
export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00 UTC`;
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

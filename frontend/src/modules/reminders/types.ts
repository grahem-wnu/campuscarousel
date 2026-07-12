// Reminder digest settings (v2.1 F1) — mirrors the backend ReminderSettings shape. The
// `notifiedEventIds` ledger is server-internal and never sent from the UI, so it's omitted here.

export type Cadence = 'daily' | 'weekly';

export interface ReminderRecipient {
  label: string;
  email: string;
}

export interface ReminderSettings {
  enabled: boolean;
  cadence: Cadence;
  sendHourUTC: number;
  weeklyDayOfWeek: number;
  horizonDays: number;
  recipients: ReminderRecipient[];
  lastSentAt?: string;
  updatedBy?: string;
}

/** The editable payload sent on PUT (server owns lastSentAt/updatedBy/notifiedEventIds). */
export type ReminderSettingsInput = Omit<ReminderSettings, 'lastSentAt' | 'updatedBy'>;

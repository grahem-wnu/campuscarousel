import { api } from '../../shared/api';
import type { ReminderSettings, ReminderSettingsInput } from './types';

export function getSettings(): Promise<ReminderSettings> {
  return api.get<ReminderSettings>('/reminders/settings');
}

export function putSettings(input: ReminderSettingsInput): Promise<ReminderSettings> {
  return api.put<ReminderSettings>('/reminders/settings', input);
}

/** Send the digest now. With no address, the server emails all configured recipients. */
export function sendTest(to?: string): Promise<{ sent: number; recipients: string[] }> {
  return api.post<{ sent: number; recipients: string[] }>('/reminders/send-test', to ? { to } : {});
}

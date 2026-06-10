// Input validation for the reminder-settings endpoints (v2.1 F1). `.strict()` rejects unknown
// fields (→ 422). All settings fields are optional on PUT so the UI can patch one knob at a time.

import { z } from '../../shared/api/index.js';

const recipientSchema = z
  .object({
    label: z.string().min(1).max(60),
    email: z.string().email().max(320),
    includePrivate: z.boolean().optional(),
  })
  .strict();

export const settingsBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    cadence: z.enum(['daily', 'weekly']).optional(),
    sendHourUTC: z.number().int().min(0).max(23).optional(),
    weeklyDayOfWeek: z.number().int().min(0).max(6).optional(),
    horizonDays: z.number().int().min(1).max(365).optional(),
    recipients: z.array(recipientSchema).max(10).optional(),
  })
  .strict();

// An empty body is valid (send a test to all configured recipients); the handler normalizes
// `undefined → {}` before validating, so this stays a plain object schema with a clean inferred type.
export const sendTestBodySchema = z
  .object({ to: z.string().email().max(320).optional() })
  .strict();

export type SettingsBody = z.infer<typeof settingsBodySchema>;
export type SendTestBody = z.infer<typeof sendTestBodySchema>;

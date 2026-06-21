// Request validation for the Master Timeline endpoints (specs/foundational/api.md).

import { z } from '../../shared/api/index.js';
import { EVENT_SOURCES } from './events.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

/** GET /timeline — filter the unified event stream. */
export const timelineQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  source: z.enum(EVENT_SOURCES).optional(),
  type: z.string().max(60).optional(),
});

/** GET /timeline/upcoming — horizon in days (default 90). Capped at ~5 years so an underclassman's
 *  college application deadlines (1–3 years out) still surface in the Upcoming view. */
export const upcomingQuerySchema = z.object({
  horizon: z.coerce.number().int().positive().max(1825).optional(),
});

/** POST /timeline/analyze — optional horizon for the AI window. */
export const analyzeSchema = z.object({ horizonDays: z.number().int().positive().max(730).optional() }).strict();

/** POST /timeline/dismiss — remove a derived event from the timeline by its id. */
export const dismissSchema = z.object({ eventId: z.string().min(1).max(300) }).strict();

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;
export type AnalyzeInput = z.infer<typeof analyzeSchema>;

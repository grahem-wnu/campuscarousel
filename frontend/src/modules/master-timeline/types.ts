// Frontend types for the Master Timeline — mirror the API payloads.

export const EVENT_SOURCES = ['activity', 'goal', 'college', 'teas', 'visit', 'scholarship', 'certification'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export interface TimelineEvent {
  id: string;
  date: string;
  source: EventSource;
  type: string;
  title: string;
  refId?: string;
  collegeId?: string;
  /** College logo for college-sourced deadline events (so the school is identifiable at a glance). */
  logoUrl?: string;
  /** College website — lets the UI derive a best-effort logo when `logoUrl` fails to load. */
  website?: string;
}

export type UpcomingGroup = 'overdue' | 'this-week' | 'next-week' | 'this-month' | 'later';
export interface UpcomingEvent extends TimelineEvent {
  daysUntil: number;
  group: UpcomingGroup;
}

export interface Analysis {
  priorities: string[];
  conflicts: string[];
  missing: string[];
  source: 'ai' | 'curated';
}

export interface TimelineFilters {
  from?: string;
  to?: string;
  source?: EventSource;
  type?: string;
}

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

/** One application deadline for a college, in plain language with an estimated hear-back date. */
export interface CollegeDeadline {
  /** Raw deadline type from the event ('early-action' | 'regular-decision' | 'program-app'). */
  type: string;
  /** Plain-language label, e.g. "Early Action". */
  label: string;
  submitDate: string;
  submitDaysUntil: number;
  /** Estimated decision-release date (rough — shown with a "~"), when the type is known. */
  decisionDate?: string;
}

/** A college's whole application plan collapsed into one entry (replaces 2-3 scattered rows). */
export interface CollegePlan {
  collegeId?: string;
  name: string;
  logoUrl?: string;
  website?: string;
  deadlines: CollegeDeadline[];
  /** Soonest submit deadline across this college's options (drives ordering). */
  soonestDaysUntil: number;
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

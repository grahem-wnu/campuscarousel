// Pure label helpers for the Opportunity Finder.

import type { OpportunityStatus, OpportunityType } from './types';

export const TYPE_LABELS: Record<OpportunityType, string> = {
  volunteer: 'Volunteering',
  shadowing: 'Job shadowing',
  internship: 'Internship',
  'training-program': 'Training / certification',
  'summer-program': 'Summer program',
  job: 'Job',
  club: 'Club / org',
  other: 'Other',
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  discovered: 'Discovered',
  interested: 'Interested',
  applied: 'Applied',
  active: 'Active',
  completed: 'Completed',
  dismissed: 'Dismissed',
};

export const TYPES = Object.keys(TYPE_LABELS) as OpportunityType[];
export const STATUSES = Object.keys(STATUS_LABELS) as OpportunityStatus[];

export function typeLabel(t: OpportunityType): string {
  return TYPE_LABELS[t] ?? t;
}

export function statusLabel(s: OpportunityStatus): string {
  return STATUS_LABELS[s] ?? s;
}

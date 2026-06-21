// Frontend types for Campus Visit Planner. Mirror the API responses (the backend's data shapes) —
// the frontend has no access to the backend data-layer package, so the contract is restated here.
// Visits are family-visible — no `visibility` field.

export const VISIT_TYPES = [
  'campus-tour',
  'department-visit',
  'open-house',
  'admitted-student-day',
  'overnight',
  'virtual',
] as const;
export const WOULD_ATTEND = ['yes', 'no', 'maybe', 'undecided'] as const;

export type VisitType = (typeof VISIT_TYPES)[number];
export type WouldAttend = (typeof WOULD_ATTEND)[number];

export interface VisitQuestion {
  question: string;
  answer?: string;
  askedTo?: string;
}

export interface Visit {
  collegeId: string;
  visitId: string;
  date: string;
  visitType?: VisitType;
  attendees?: string[];
  questionsToAsk?: VisitQuestion[];
  impressions?: string;
  pros?: string[];
  cons?: string[];
  photos?: string[];
  wouldAttend?: WouldAttend;
  travelCost?: number;
  createdBy?: string;
  /** Cached visit prep, generated when the visit is saved (show/hide in the UI; regenerate on demand). */
  prep?: VisitPrep;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps; the server stamps createdBy). */
export interface VisitInput {
  date: string;
  visitType?: VisitType;
  attendees?: string[];
  questionsToAsk?: VisitQuestion[];
  impressions?: string;
  pros?: string[];
  cons?: string[];
  photos?: string[];
  wouldAttend?: WouldAttend;
  travelCost?: number;
}

export interface VisitPrep {
  bestTime: string;
  questions: string[];
  logistics: { address?: string; parking?: string; contact?: string; campusVisitUrl?: string };
  source: 'ai' | 'curated';
}

/** Minimal shape of a college from the College Hub list endpoint (only what this module needs). */
export interface CollegeOption {
  collegeId: string;
  name: string;
  state?: string;
  location?: string;
}

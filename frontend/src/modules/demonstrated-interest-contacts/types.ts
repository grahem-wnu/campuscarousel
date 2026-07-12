// Frontend types for Demonstrated Interest + Contact Network. These mirror the API responses (the
// backend's data shapes) — the frontend has no access to the backend data-layer package.

export const TOUCHPOINT_TYPES = [
  'info-session',
  'campus-visit',
  'email-exchange',
  'phone-call',
  'webinar',
  'college-fair',
  'interview',
  'social-media',
  'other',
] as const;
export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

export const RELATIONSHIPS = ['mentor', 'supervisor', 'teacher', 'admissions', 'professional', 'recommender', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RECOMMENDER_SLOTS = ['stem-teacher', 'humanities-teacher', 'clinical-supervisor', 'community-leader'] as const;
export type RecommenderSlot = (typeof RECOMMENDER_SLOTS)[number];

export interface Touchpoint {
  collegeId: string;
  touchpointId: string;
  type: TouchpointType;
  date: string;
  description?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  followUpNeeded?: boolean;
  followUpDate?: string;
  followUpCompleted?: boolean;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TouchpointInput {
  type: TouchpointType;
  date: string;
  description?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  followUpNeeded?: boolean;
  followUpDate?: string;
  followUpCompleted?: boolean;
  notes?: string;
}

export interface FollowUp extends Touchpoint {
  collegeName: string;
}

export interface Contact {
  contactId: string;
  name: string;
  role?: string;
  organization?: string;
  relationship?: Relationship;
  phone?: string;
  email?: string;
  linkedCollegeId?: string;
  howMet?: string;
  dateMet?: string;
  lastContactDate?: string;
  notes?: string;
  isPotentialRecommender?: boolean;
  recommenderSlot?: RecommenderSlot;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  name: string;
  role?: string;
  organization?: string;
  relationship?: Relationship;
  phone?: string;
  email?: string;
  linkedCollegeId?: string;
  howMet?: string;
  dateMet?: string;
  lastContactDate?: string;
  notes?: string;
  isPotentialRecommender?: boolean;
  recommenderSlot?: RecommenderSlot;
}

export interface RecommenderGroup {
  slot: RecommenderSlot | 'unassigned';
  contacts: Contact[];
}

export interface RecommendersResponse {
  groups: RecommenderGroup[];
  gaps: RecommenderSlot[];
}

/** Minimal college reference from college-hub's GET /colleges (consumed for the picker + names). */
export interface CollegeRef {
  collegeId: string;
  name: string;
}

export interface ContactFilters {
  q?: string;
  relationship?: Relationship | '';
  collegeId?: string;
}

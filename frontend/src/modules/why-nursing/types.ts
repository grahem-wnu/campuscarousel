// Frontend types for the "Why Nursing" living document. These mirror the API responses (the
// backend's data shapes) — the frontend has no access to the backend data-layer package, so the
// contract is restated here and kept in sync via the API.

export const CATEGORIES = [
  'moment',
  'realization',
  'conversation',
  'observation',
  'experience',
  'inspiration',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Visibility = 'family' | 'private';

export interface WhyNursingEntry {
  entryId: string;
  date: string;
  title: string;
  content: string;
  category?: Category;
  linkedActivityId?: string;
  linkedClinicalId?: string;
  tags?: string[];
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps). */
export interface WhyNursingInput {
  date: string;
  title: string;
  content: string;
  category?: Category;
  linkedActivityId?: string;
  linkedClinicalId?: string;
  tags?: string[];
  visibility?: Visibility;
}

export interface ListFilters {
  category?: Category;
  from?: string;
  to?: string;
}

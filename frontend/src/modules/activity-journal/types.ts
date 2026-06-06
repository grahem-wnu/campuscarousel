// Frontend types for the Activity Journal. These mirror the API responses (the backend's data
// shapes) — the frontend has no access to the backend data-layer package, so the contract is
// restated here and kept in sync via the API.

export const CATEGORIES = [
  'volunteer',
  'clinical',
  'academic',
  'athletic',
  'leadership',
  'personal',
  'work',
  'award',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Visibility = 'family' | 'private';

export interface Activity {
  activityId: string;
  userId: string;
  date: string;
  category: Category;
  subcategory?: string;
  title: string;
  description?: string;
  hours?: number;
  reflection?: string;
  visibility: Visibility;
  tags?: string[];
  linkedColleges?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps). */
export interface ActivityInput {
  date: string;
  category: Category;
  title: string;
  subcategory?: string;
  description?: string;
  hours?: number;
  reflection?: string;
  visibility?: Visibility;
  tags?: string[];
  linkedColleges?: string[];
}

export interface ActivitySummary {
  totalCount: number;
  totalHours: number;
  hoursByCategory: Record<string, number>;
  countsByCategory: Record<string, number>;
  countsByMonth: Record<string, number>;
}

export interface ListFilters {
  category?: Category;
  from?: string;
  to?: string;
}

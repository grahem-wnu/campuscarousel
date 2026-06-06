// Frontend types for the Goal Tracker. These mirror the API responses (the backend's data shapes);
// the frontend has no access to the backend data-layer package, so the contract is restated here
// and kept in sync via the API. Goals are family-visible — there is no `visibility` field.

export const CATEGORIES = [
  'academic',
  'clinical',
  'extracurricular',
  'test-prep',
  'application',
  'personal',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['not-started', 'in-progress', 'completed', 'deferred', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];

export interface Milestone {
  id: string;
  label: string;
  completed?: boolean;
  completedDate?: string;
}

export interface Goal {
  goalId: string;
  title: string;
  description?: string;
  category?: Category;
  targetDate?: string;
  period?: string;
  status?: Status;
  progress?: number;
  milestones?: Milestone[];
  linkedActivities?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps; the server records createdBy). */
export interface GoalInput {
  title: string;
  description?: string;
  category?: Category;
  targetDate?: string;
  period?: string;
  status?: Status;
  progress?: number;
  milestones?: { id?: string; label: string; completed?: boolean; completedDate?: string }[];
  linkedActivities?: string[];
}

export interface ListFilters {
  period?: string;
  status?: Status;
  category?: Category;
}

/** Profile context sent to POST /goals/suggest. */
export interface SuggestInput {
  gradeLevel?: string;
  careerGoal?: string;
  period?: string;
  currentActivities?: string[];
  targetColleges?: string[];
  count?: number;
}

/** An AI-proposed goal — an editable draft, never auto-saved. */
export interface SuggestedGoal {
  title: string;
  description?: string;
  category?: Category;
  period?: string;
  milestones?: string[];
}

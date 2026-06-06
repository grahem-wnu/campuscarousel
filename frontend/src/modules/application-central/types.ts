// Frontend types for Application Central (essay workspace). Mirror the API responses; the frontend
// has no access to the backend data-layer package, so the contract is restated here.

export const ESSAY_STATUSES = ['brainstorming', 'drafting', 'reviewing', 'final'] as const;
export type EssayStatus = (typeof ESSAY_STATUSES)[number];

export interface Draft {
  version: number;
  content: string;
  createdAt: string;
  wordCount?: number;
}

export interface Essay {
  essayId: string;
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  drafts?: Draft[];
  status?: EssayStatus;
  aiSuggestedActivities?: string[];
  aiSuggestedAngles?: string[];
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssayInput {
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  status?: EssayStatus;
  notes?: string;
  draftContent?: string;
}

export interface EssayUpdate {
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  status?: EssayStatus;
  notes?: string;
  addDraftContent?: string;
}

export interface SelectedExperience {
  source: 'activity' | 'clinical' | 'why-nursing';
  id: string;
  title: string;
  why: string;
}

export interface ExperienceSuggestions {
  experiences: SelectedExperience[];
  angles: string[];
  essay: Essay;
}

export interface EssayFeedback {
  strengths: string[];
  suggestions: string[];
  authenticity: string;
  structure: string;
}

export interface ListFilters {
  collegeId?: string;
  status?: EssayStatus;
}

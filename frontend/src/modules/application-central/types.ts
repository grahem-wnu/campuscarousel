// Frontend types for Application Central. Mirror the API responses (the backend Essay shape + AI +
// derived overview payloads).

export const ESSAY_STATUSES = ['brainstorming', 'drafting', 'reviewing', 'final'] as const;
export type EssayStatus = (typeof ESSAY_STATUSES)[number];

export interface EssayDraft {
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
  drafts?: EssayDraft[];
  status?: EssayStatus;
  aiSuggestedActivities?: string[];
  aiSuggestedAngles?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssayInput {
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  status?: EssayStatus;
  notes?: string;
}

export interface ExperienceSuggestion {
  title: string;
  kind: 'activity' | 'clinical' | 'why-nursing';
  why: string;
}
export interface FindResult {
  suggestedExperiences: ExperienceSuggestion[];
  angles: string[];
  source: 'ai' | 'curated';
}
export interface FindResponse {
  result: FindResult;
  basedOn: { activities: number; clinical: number; whyNursing: number };
}

export interface EssayReview {
  strengths: string[];
  improvements: string[];
  authenticity: string;
  wordCount: number;
  onTarget: boolean | null;
  rewrote: false;
  source: 'ai' | 'curated';
}

export interface ApplicationRow {
  collegeId: string;
  name: string;
  status?: string;
  programType?: string;
  isTopPick?: boolean;
  nextDeadline: { label: string; date: string } | null;
  daysUntilDeadline: number | null;
  essays: { total: number; final: number; statuses: string[] };
  hasTeasScore: boolean;
}

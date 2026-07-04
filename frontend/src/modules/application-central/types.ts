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

export const REVIEW_VERDICTS = ['ready', 'close', 'keep-working'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface LastReview {
  overall: number;
  verdict: ReviewVerdict;
  wordCount: number;
  version?: number;
  reviewedAt: string;
}

export interface Essay {
  essayId: string;
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  targetWords?: number;
  drafts?: EssayDraft[];
  status?: EssayStatus;
  aiSuggestedActivities?: string[];
  aiSuggestedAngles?: string[];
  lastReview?: LastReview;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssayInput {
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  targetWords?: number;
  status?: EssayStatus;
  notes?: string;
}

export interface ExperienceSuggestion {
  title: string;
  kind: 'activity' | 'experience' | 'motivation';
  why: string;
}
export interface FindResult {
  suggestedExperiences: ExperienceSuggestion[];
  angles: string[];
  source: 'ai' | 'curated';
}
export interface FindResponse {
  result: FindResult;
  basedOn: { activities: number; experiences: number; motivations: number };
}

export interface ReviewRatings {
  promptFit: number;
  voice: number;
  structure: number;
  specificity: number;
  collegeFit?: number;
}

export interface EssayReview {
  strengths: string[];
  improvements: string[];
  authenticity: string;
  /** 1-10 rubric — present only when the real AI path produced the review. */
  ratings?: ReviewRatings;
  overall?: number;
  verdict?: ReviewVerdict;
  wordCount: number;
  onTarget: boolean | null;
  rewrote: false;
  source: 'ai' | 'curated';
}

export interface PracticeQuestion {
  question: string;
  why: string;
  tip: string;
}
export interface PracticeQuestionSet {
  questions: PracticeQuestion[];
  source: 'ai' | 'curated';
  collegeName?: string;
}

/** Just enough of a college to pick one and offer its real prompts. */
export interface CollegeOption {
  collegeId: string;
  name: string;
  essayPrompts?: string[];
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
  hasExamScore: boolean;
}

// --- Application tracker (persisted APPLICATION# rows) ---------------------
export const APPLICATION_STATUSES = ['planning', 'in-progress', 'submitted', 'under-review', 'decided', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_DECISIONS = ['none', 'accepted', 'waitlisted', 'deferred', 'rejected'] as const;
export type ApplicationDecision = (typeof APPLICATION_DECISIONS)[number];

export interface Application {
  applicationId: string;
  collegeId: string;
  status?: ApplicationStatus;
  applicationType?: string;
  deadline?: string;
  submittedDate?: string;
  components?: Partial<Record<'essay' | 'recommendations' | 'transcript' | 'testScores' | 'financialAid', string>>;
  decision?: ApplicationDecision;
  decisionDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface ApplicationInput {
  collegeId: string;
  status?: ApplicationStatus;
  deadline?: string;
  decision?: ApplicationDecision;
  decisionDate?: string;
  notes?: string;
}

export interface DecisionRow {
  collegeId: string;
  name: string;
  decision: ApplicationDecision;
  decisionDate?: string;
  programType?: string;
  isTopPick?: boolean;
  fitScore?: number;
  ranking?: string;
  estimatedTotalCost?: number;
  estimatedCostAfterAid?: number;
}

// --- Recommendation strategy board ----------------------------------------
export const RECOMMENDATION_SLOTS = ['stem-teacher', 'humanities-teacher', 'clinical-supervisor', 'community-leader', 'other'] as const;
export type RecommendationSlot = (typeof RECOMMENDATION_SLOTS)[number];
export const RECOMMENDATION_STATUSES = ['identified', 'asked', 'agreed', 'received', 'submitted', 'declined'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export interface Recommendation {
  recommendationId: string;
  slot: RecommendationSlot;
  contactId?: string;
  contactName?: string;
  relationshipStrength?: 'strong' | 'moderate' | 'developing';
  status?: RecommendationStatus;
  askTimeline?: string;
  askedDate?: string;
  receivedDate?: string;
  submittedColleges?: string[];
  aiBrief?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface RecommendationInput {
  slot: RecommendationSlot;
  contactName?: string;
  relationshipStrength?: 'strong' | 'moderate' | 'developing';
  status?: RecommendationStatus;
  askTimeline?: string;
  submittedColleges?: string[];
  notes?: string;
}
export interface RecommenderBrief {
  summary: string;
  talkingPoints: string[];
  suggestedStories: string[];
  includesPrivate: false;
  source: 'ai' | 'curated';
}

// --- Test-score tracker ----------------------------------------------------
export const TEST_SCORE_TYPES = ['SAT', 'ACT', 'TEAS', 'AP'] as const;
export type TestScoreType = (typeof TEST_SCORE_TYPES)[number];

export interface TestScore {
  scoreId: string;
  testType: TestScoreType;
  testDate?: string;
  score?: number;
  sectionScores?: Record<string, number>;
  apSubject?: string;
  superscore?: number;
  sentTo?: string[];
  official?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface TestScoreInput {
  testType: TestScoreType;
  testDate?: string;
  score?: number;
  apSubject?: string;
  sentTo?: string[];
  official?: boolean;
  notes?: string;
}

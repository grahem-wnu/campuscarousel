// Frontend types for Interview Prep. Mirror the API responses (the backend Interview shape + AI
// payloads).

export const INTERVIEW_TYPES = ['mock-practice', 'real-interview'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const QUESTION_CATEGORIES = [
  'motivation',
  'behavioral',
  'clinical',
  'situational',
  'school-specific',
  'ethics',
  'general',
] as const;
export type Category = (typeof QUESTION_CATEGORIES)[number];

export interface QuestionEntry {
  question: string;
  answer?: string;
  aiFeedback?: string;
  rating?: number;
  linkedActivities?: string[];
}

export interface Interview {
  sessionId: string;
  type: InterviewType;
  collegeId?: string;
  date: string;
  questions?: QuestionEntry[];
  overallNotes?: string;
  confidenceLevel?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewInput {
  type: InterviewType;
  date: string;
  collegeId?: string;
  questions?: QuestionEntry[];
  overallNotes?: string;
  confidenceLevel?: number;
}

export interface BankQuestion {
  id: string;
  question: string;
  category: Category;
  starred?: boolean;
}

export interface AnswerFeedback {
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  rating: number;
  references: string[];
  source: 'ai' | 'curated';
}

export interface MockSession {
  session: Interview;
  categories: Category[];
}

export interface AnswerResponse {
  feedback: AnswerFeedback;
  session: Interview;
}

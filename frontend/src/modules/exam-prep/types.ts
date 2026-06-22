// Frontend types for Exam Prep. Mirror the API responses (the backend ExamScore shape + AI payloads).

export const EXAM_TYPES = ['practice-test', 'study-session', 'official-exam'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const SECTIONS = ['reading', 'math', 'science', 'englishLanguageUsage'] as const;
export type Section = (typeof SECTIONS)[number];

export interface SectionScores {
  reading?: number;
  math?: number;
  science?: number;
  englishLanguageUsage?: number;
}

export interface ExamRecord {
  recordId: string;
  type: ExamType;
  date: string;
  /** Which exam this score is for (e.g. "SAT", "TEAS"); drives the scoring scale shown in the UI. */
  examName?: string;
  overallScore?: number;
  sectionScores?: SectionScores;
  source?: string;
  studyTopics?: string[];
  studyDuration?: number;
  weakAreas?: string[];
  strongAreas?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamInput {
  type: ExamType;
  date: string;
  examName?: string;
  overallScore?: number;
  sectionScores?: SectionScores;
  source?: string;
  studyTopics?: string[];
  studyDuration?: number;
  weakAreas?: string[];
  strongAreas?: string[];
  notes?: string;
}

export type Band = 'strong' | 'needs-work' | 'critical';

export interface ProgressPoint {
  date: string;
  type: ExamType;
  overallScore?: number;
  sectionScores: Record<Section, number | undefined>;
}

export interface ProgressSummary {
  attempts: number;
  latestOverall: number | null;
  bestOverall: number | null;
  trend: number | null;
  cumulativeStudyHours: number;
  weakSections: Section[];
  sectionBands: Partial<Record<Section, Band>>;
}

export interface Readiness {
  ready: boolean;
  gap: number | null;
  message: string;
}

export interface ProgressResponse {
  progression: ProgressPoint[];
  summary: ProgressSummary;
  readiness: Readiness;
}

export interface StudyWeek {
  week: number;
  focus: string[];
  hours: number;
  practice: string;
}
export interface StudyPlan {
  summary: string;
  focusAreas: string[];
  weeks: StudyWeek[];
  source: 'ai' | 'curated';
}

export interface Analysis {
  summary: string;
  recommendations: string[];
  readiness: string;
  source: 'ai' | 'curated';
}

export interface StudyPlanRequest {
  examDate?: string;
  targetScore?: number;
  targetSchools?: string[];
  hoursPerWeek?: number;
  focusAreas?: string[];
}

// Frontend types for TEAS Prep. Mirror the API responses (the backend Teas shape + AI payloads).

export const TEAS_TYPES = ['practice-test', 'study-session', 'official-exam'] as const;
export type TeasType = (typeof TEAS_TYPES)[number];

export const SECTIONS = ['reading', 'math', 'science', 'englishLanguageUsage'] as const;
export type Section = (typeof SECTIONS)[number];

export interface SectionScores {
  reading?: number;
  math?: number;
  science?: number;
  englishLanguageUsage?: number;
}

export interface TeasRecord {
  recordId: string;
  type: TeasType;
  date: string;
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

export interface TeasInput {
  type: TeasType;
  date: string;
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
  type: TeasType;
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

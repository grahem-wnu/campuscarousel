// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type {
  Application,
  ApplicationInput,
  ApplicationRow,
  CollegeOption,
  DecisionRow,
  Essay,
  EssayInput,
  EssayReview,
  EssayStatus,
  FindResponse,
  PracticeQuestionSet,
  Recommendation,
  RecommendationInput,
  RecommenderBrief,
  TestScore,
  TestScoreInput,
} from './types';

export async function listEssays(filters: { collegeId?: string; status?: EssayStatus } = {}): Promise<Essay[]> {
  const res = await api.get<{ essays: Essay[] }>('/essays', { query: filters });
  return res.essays;
}

export function getEssay(id: string): Promise<Essay> {
  return api.get<Essay>(`/essays/${encodeURIComponent(id)}`);
}

export function createEssay(input: EssayInput): Promise<Essay> {
  return api.post<Essay>('/essays', input);
}

export function updateEssay(id: string, patch: Partial<EssayInput>): Promise<Essay> {
  return api.put<Essay>(`/essays/${encodeURIComponent(id)}`, patch);
}

export function deleteEssay(id: string): Promise<void> {
  return api.del<void>(`/essays/${encodeURIComponent(id)}`);
}

export function addDraft(id: string, content: string): Promise<Essay> {
  return api.post<Essay>(`/essays/${encodeURIComponent(id)}/draft`, { content });
}

export function findExperiences(id: string, prompt?: string): Promise<FindResponse> {
  return api.post<FindResponse>(`/essays/${encodeURIComponent(id)}/find-experiences`, prompt ? { prompt } : {});
}

export function reviewEssay(
  id: string,
  opts: { version?: number; content?: string; targetWords?: number } = {},
): Promise<{ review: EssayReview; essay: Essay }> {
  return api.post<{ review: EssayReview; essay: Essay }>(`/essays/${encodeURIComponent(id)}/review`, opts);
}

/** Questions-first: sample questions for a college BEFORE an essay exists. */
export function getPracticeQuestionsForCollege(
  input: { collegeId?: string; collegeName?: string; count?: number } = {},
): Promise<PracticeQuestionSet> {
  return api.post<PracticeQuestionSet>('/essays/practice-questions', input);
}

/** Roster colleges, slimmed to what the essay UI needs (picker + real prompts). */
export async function listCollegeOptions(): Promise<CollegeOption[]> {
  const res = await api.get<{ colleges: Array<CollegeOption & Record<string, unknown>> }>('/colleges');
  return res.colleges.map((c) => ({ collegeId: c.collegeId, name: c.name, essayPrompts: c.essayPrompts }));
}

export async function getOverview(): Promise<ApplicationRow[]> {
  const res = await api.get<{ applications: ApplicationRow[] }>('/applications/overview');
  return res.applications;
}

// --- Application tracker ----------------------------------------------------
export async function listApplications(): Promise<Application[]> {
  const res = await api.get<{ applications: Application[] }>('/applications');
  return res.applications;
}
export function createApplication(input: ApplicationInput): Promise<Application> {
  return api.post<Application>('/applications', input);
}
export function updateApplication(id: string, patch: Partial<ApplicationInput>): Promise<Application> {
  return api.put<Application>(`/applications/${encodeURIComponent(id)}`, patch);
}
export function deleteApplication(id: string): Promise<void> {
  return api.del<void>(`/applications/${encodeURIComponent(id)}`);
}
export async function getDecisionMatrix(): Promise<DecisionRow[]> {
  const res = await api.get<{ decisions: DecisionRow[] }>('/applications/decision-matrix');
  return res.decisions;
}

// --- Recommendation strategy board -----------------------------------------
export async function listRecommendations(): Promise<Recommendation[]> {
  const res = await api.get<{ recommendations: Recommendation[] }>('/recommendations');
  return res.recommendations;
}
export function createRecommendation(input: RecommendationInput): Promise<Recommendation> {
  return api.post<Recommendation>('/recommendations', input);
}
export function updateRecommendation(id: string, patch: Partial<RecommendationInput>): Promise<Recommendation> {
  return api.put<Recommendation>(`/recommendations/${encodeURIComponent(id)}`, patch);
}
export function deleteRecommendation(id: string): Promise<void> {
  return api.del<void>(`/recommendations/${encodeURIComponent(id)}`);
}
export async function generateRecommenderBrief(id: string, focus?: string): Promise<{ brief: RecommenderBrief; recommendation: Recommendation }> {
  return api.post<{ brief: RecommenderBrief; recommendation: Recommendation }>(`/recommendations/${encodeURIComponent(id)}/brief`, focus ? { focus } : {});
}

// --- Test-score tracker -----------------------------------------------------
export async function listTestScores(): Promise<TestScore[]> {
  const res = await api.get<{ testScores: TestScore[] }>('/test-scores');
  return res.testScores;
}
export function createTestScore(input: TestScoreInput): Promise<TestScore> {
  return api.post<TestScore>('/test-scores', input);
}
export function updateTestScore(id: string, patch: Partial<TestScoreInput>): Promise<TestScore> {
  return api.put<TestScore>(`/test-scores/${encodeURIComponent(id)}`, patch);
}
export function deleteTestScore(id: string): Promise<void> {
  return api.del<void>(`/test-scores/${encodeURIComponent(id)}`);
}

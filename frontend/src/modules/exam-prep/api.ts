// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type {
  Analysis,
  ProgressResponse,
  StudyPlan,
  StudyPlanRequest,
  ExamInput,
  ExamRecord,
  ExamType,
} from './types';

export async function listRecords(type?: ExamType): Promise<ExamRecord[]> {
  const res = await api.get<{ records: ExamRecord[] }>('/exams', { query: { type } });
  return res.records;
}

export function createRecord(input: ExamInput): Promise<ExamRecord> {
  return api.post<ExamRecord>('/exams', input);
}

export function updateRecord(id: string, patch: Partial<ExamInput>): Promise<ExamRecord> {
  return api.put<ExamRecord>(`/exams/${encodeURIComponent(id)}`, patch);
}

export function deleteRecord(id: string): Promise<void> {
  return api.del<void>(`/exams/${encodeURIComponent(id)}`);
}

export function getProgress(): Promise<ProgressResponse> {
  return api.get<ProgressResponse>('/exams/progress');
}

export async function getStudyPlan(req: StudyPlanRequest = {}): Promise<StudyPlan> {
  const res = await api.post<{ plan: StudyPlan }>('/exams/study-plan', req);
  return res.plan;
}

export async function analyze(req: { targetScore?: number; examDate?: string } = {}): Promise<Analysis> {
  const res = await api.post<{ analysis: Analysis }>('/exams/analyze', req);
  return res.analysis;
}

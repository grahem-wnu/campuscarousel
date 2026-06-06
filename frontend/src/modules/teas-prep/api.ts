// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type {
  Analysis,
  ProgressResponse,
  StudyPlan,
  StudyPlanRequest,
  TeasInput,
  TeasRecord,
  TeasType,
} from './types';

export async function listRecords(type?: TeasType): Promise<TeasRecord[]> {
  const res = await api.get<{ records: TeasRecord[] }>('/teas', { query: { type } });
  return res.records;
}

export function createRecord(input: TeasInput): Promise<TeasRecord> {
  return api.post<TeasRecord>('/teas', input);
}

export function updateRecord(id: string, patch: Partial<TeasInput>): Promise<TeasRecord> {
  return api.put<TeasRecord>(`/teas/${encodeURIComponent(id)}`, patch);
}

export function deleteRecord(id: string): Promise<void> {
  return api.del<void>(`/teas/${encodeURIComponent(id)}`);
}

export function getProgress(): Promise<ProgressResponse> {
  return api.get<ProgressResponse>('/teas/progress');
}

export async function getStudyPlan(req: StudyPlanRequest = {}): Promise<StudyPlan> {
  const res = await api.post<{ plan: StudyPlan }>('/teas/study-plan', req);
  return res.plan;
}

export async function analyze(req: { targetScore?: number; examDate?: string } = {}): Promise<Analysis> {
  const res = await api.post<{ analysis: Analysis }>('/teas/analyze', req);
  return res.analysis;
}

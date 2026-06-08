// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type { ApplicationRow, Essay, EssayInput, EssayReview, EssayStatus, FindResponse } from './types';

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

export async function reviewEssay(id: string, opts: { version?: number; content?: string; targetWords?: number } = {}): Promise<EssayReview> {
  const res = await api.post<{ review: EssayReview }>(`/essays/${encodeURIComponent(id)}/review`, opts);
  return res.review;
}

export async function getOverview(): Promise<ApplicationRow[]> {
  const res = await api.get<{ applications: ApplicationRow[] }>('/applications/overview');
  return res.applications;
}

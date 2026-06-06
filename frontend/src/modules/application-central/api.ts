// The module's data calls. Thin wrappers over the shared typed API client (token + error envelope).

import { api } from '../../shared/api';
import type {
  Essay,
  EssayFeedback,
  EssayInput,
  EssayUpdate,
  ExperienceSuggestions,
  ListFilters,
} from './types';

export async function listEssays(filters: ListFilters = {}): Promise<Essay[]> {
  const res = await api.get<{ essays: Essay[] }>('/essays', {
    query: { collegeId: filters.collegeId, status: filters.status },
  });
  return res.essays;
}

export function getEssay(id: string): Promise<Essay> {
  return api.get<Essay>(`/essays/${encodeURIComponent(id)}`);
}

export function createEssay(input: EssayInput): Promise<Essay> {
  return api.post<Essay>('/essays', input);
}

export function updateEssay(id: string, patch: EssayUpdate): Promise<Essay> {
  return api.put<Essay>(`/essays/${encodeURIComponent(id)}`, patch);
}

export function deleteEssay(id: string): Promise<void> {
  return api.del<void>(`/essays/${encodeURIComponent(id)}`);
}

export function findExperiences(id: string, focus?: string): Promise<ExperienceSuggestions> {
  return api.post<ExperienceSuggestions>(`/essays/${encodeURIComponent(id)}/find-experiences`, { focus });
}

export async function reviewEssay(id: string, content?: string): Promise<EssayFeedback> {
  const res = await api.post<{ feedback: EssayFeedback }>(`/essays/${encodeURIComponent(id)}/review`, { content });
  return res.feedback;
}

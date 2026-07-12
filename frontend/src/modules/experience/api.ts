// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type {
  ExperienceEntry,
  ExperienceInput,
  ExperienceSummary,
  ExportResult,
  ListFilters,
  SupervisorEntry,
} from './types';

export async function listExperience(filters: ListFilters = {}): Promise<ExperienceEntry[]> {
  const res = await api.get<{ entries: ExperienceEntry[] }>('/experience', {
    query: {
      facility: filters.facility,
      department: filters.department,
      from: filters.from,
      to: filters.to,
    },
  });
  return res.entries;
}

export function getExperience(id: string): Promise<ExperienceEntry> {
  return api.get<ExperienceEntry>(`/experience/${encodeURIComponent(id)}`);
}

export function createExperience(input: ExperienceInput): Promise<ExperienceEntry> {
  return api.post<ExperienceEntry>('/experience', input);
}

export function updateExperience(id: string, patch: Partial<ExperienceInput>): Promise<ExperienceEntry> {
  return api.put<ExperienceEntry>(`/experience/${encodeURIComponent(id)}`, patch);
}

export function deleteExperience(id: string): Promise<void> {
  return api.del<void>(`/experience/${encodeURIComponent(id)}`);
}

export function getSummary(): Promise<ExperienceSummary> {
  return api.get<ExperienceSummary>('/experience/summary');
}

export async function getSupervisors(): Promise<SupervisorEntry[]> {
  const res = await api.get<{ supervisors: SupervisorEntry[] }>('/experience/supervisors');
  return res.supervisors;
}

export function exportPdf(filters: ListFilters & { studentName?: string } = {}): Promise<ExportResult> {
  return api.post<ExportResult>('/experience/export', filters);
}

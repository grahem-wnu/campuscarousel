// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type {
  Clinical,
  ClinicalInput,
  ClinicalSummary,
  ExportResult,
  ListFilters,
  SupervisorEntry,
} from './types';

export async function listClinical(filters: ListFilters = {}): Promise<Clinical[]> {
  const res = await api.get<{ entries: Clinical[] }>('/clinical', {
    query: {
      facility: filters.facility,
      department: filters.department,
      from: filters.from,
      to: filters.to,
    },
  });
  return res.entries;
}

export function getClinical(id: string): Promise<Clinical> {
  return api.get<Clinical>(`/clinical/${encodeURIComponent(id)}`);
}

export function createClinical(input: ClinicalInput): Promise<Clinical> {
  return api.post<Clinical>('/clinical', input);
}

export function updateClinical(id: string, patch: Partial<ClinicalInput>): Promise<Clinical> {
  return api.put<Clinical>(`/clinical/${encodeURIComponent(id)}`, patch);
}

export function deleteClinical(id: string): Promise<void> {
  return api.del<void>(`/clinical/${encodeURIComponent(id)}`);
}

export function getSummary(): Promise<ClinicalSummary> {
  return api.get<ClinicalSummary>('/clinical/summary');
}

export async function getSupervisors(): Promise<SupervisorEntry[]> {
  const res = await api.get<{ supervisors: SupervisorEntry[] }>('/clinical/supervisors');
  return res.supervisors;
}

export function exportPdf(filters: ListFilters & { studentName?: string } = {}): Promise<ExportResult> {
  return api.post<ExportResult>('/clinical/export', filters);
}

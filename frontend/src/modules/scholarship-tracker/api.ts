// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type {
  DiscoveredScholarship,
  DiscoverInput,
  ListFilters,
  Scholarship,
  ScholarshipInput,
  ScholarshipSummary,
} from './types';

export async function listScholarships(filters: ListFilters = {}): Promise<Scholarship[]> {
  const res = await api.get<{ scholarships: Scholarship[] }>('/scholarships', {
    query: {
      type: filters.type,
      status: filters.status,
      linkedCollege: filters.linkedCollege,
      deadlineBefore: filters.deadlineBefore,
    },
  });
  return res.scholarships;
}

export function getScholarship(id: string): Promise<Scholarship> {
  return api.get<Scholarship>(`/scholarships/${encodeURIComponent(id)}`);
}

export function createScholarship(input: ScholarshipInput): Promise<Scholarship> {
  return api.post<Scholarship>('/scholarships', input);
}

export function updateScholarship(id: string, patch: Partial<ScholarshipInput>): Promise<Scholarship> {
  return api.put<Scholarship>(`/scholarships/${encodeURIComponent(id)}`, patch);
}

export function deleteScholarship(id: string): Promise<void> {
  return api.del<void>(`/scholarships/${encodeURIComponent(id)}`);
}

export function getSummary(): Promise<ScholarshipSummary> {
  return api.get<ScholarshipSummary>('/scholarships/summary');
}

export async function discoverScholarships(input: DiscoverInput): Promise<DiscoveredScholarship[]> {
  const res = await api.post<{ results: DiscoveredScholarship[] }>('/scholarships/discover', input);
  return res.results;
}

export async function bulkAddScholarships(
  scholarships: ScholarshipInput[],
  hydrate = false,
): Promise<Scholarship[]> {
  const res = await api.post<{ scholarships: Scholarship[] }>('/scholarships/bulk-add', {
    scholarships,
    hydrate,
  });
  return res.scholarships;
}

export function hydrateScholarship(id: string): Promise<Scholarship> {
  return api.post<Scholarship>(`/scholarships/${encodeURIComponent(id)}/hydrate`);
}

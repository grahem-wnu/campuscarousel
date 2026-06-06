// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { ListFilters, WhyNursingEntry, WhyNursingInput } from './types';

export async function listEntries(filters: ListFilters = {}): Promise<WhyNursingEntry[]> {
  const res = await api.get<{ entries: WhyNursingEntry[] }>('/why-nursing', {
    query: { category: filters.category, from: filters.from, to: filters.to },
  });
  return res.entries;
}

export function getEntry(id: string): Promise<WhyNursingEntry> {
  return api.get<WhyNursingEntry>(`/why-nursing/${encodeURIComponent(id)}`);
}

export function createEntry(input: WhyNursingInput): Promise<WhyNursingEntry> {
  return api.post<WhyNursingEntry>('/why-nursing', input);
}

export function updateEntry(id: string, patch: Partial<WhyNursingInput>): Promise<WhyNursingEntry> {
  return api.put<WhyNursingEntry>(`/why-nursing/${encodeURIComponent(id)}`, patch);
}

export function deleteEntry(id: string): Promise<void> {
  return api.del<void>(`/why-nursing/${encodeURIComponent(id)}`);
}

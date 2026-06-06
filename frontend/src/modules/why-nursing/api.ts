// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import { activityLinkOptions, clinicalLinkOptions } from './logic';
import type { LinkOption, ListFilters, WhyNursingEntry, WhyNursingInput } from './types';

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

// Link-target pickers. These read the journal and clinical-hours modules' public list endpoints
// (visibility-filtered server-side off the JWT, so the caller only ever sees their own entries) and
// map them to {id, label} options. We consume those endpoints, not those modules' code.

export async function listLinkableActivities(): Promise<LinkOption[]> {
  const res = await api.get<{ activities: { activityId: string; title: string; date: string }[] }>('/activities');
  return activityLinkOptions(res.activities);
}

export async function listLinkableClinical(): Promise<LinkOption[]> {
  const res = await api.get<{ entries: { entryId: string; facility: string; date: string }[] }>('/clinical');
  return clinicalLinkOptions(res.entries);
}

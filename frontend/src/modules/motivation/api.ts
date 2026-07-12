// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import { activityLinkOptions, clinicalLinkOptions } from './logic';
import type { LinkOption, ListFilters, MotivationEntry, MotivationInput } from './types';

export async function listEntries(filters: ListFilters = {}): Promise<MotivationEntry[]> {
  const res = await api.get<{ entries: MotivationEntry[] }>('/motivations', {
    query: { category: filters.category, from: filters.from, to: filters.to },
  });
  return res.entries;
}

export function getEntry(id: string): Promise<MotivationEntry> {
  return api.get<MotivationEntry>(`/motivations/${encodeURIComponent(id)}`);
}

export function createEntry(input: MotivationInput): Promise<MotivationEntry> {
  return api.post<MotivationEntry>('/motivations', input);
}

export function updateEntry(id: string, patch: Partial<MotivationInput>): Promise<MotivationEntry> {
  return api.put<MotivationEntry>(`/motivations/${encodeURIComponent(id)}`, patch);
}

export function deleteEntry(id: string): Promise<void> {
  return api.del<void>(`/motivations/${encodeURIComponent(id)}`);
}

// Link-target pickers. These read the journal and clinical-hours modules' public list endpoints
// (visibility-filtered server-side off the JWT, so the caller only ever sees their own entries) and
// map them to {id, label} options. We consume those endpoints, not those modules' code.

export async function listLinkableActivities(): Promise<LinkOption[]> {
  const res = await api.get<{ activities: { activityId: string; title: string; date: string }[] }>('/activities');
  return activityLinkOptions(res.activities);
}

export async function listLinkableClinical(): Promise<LinkOption[]> {
  const res = await api.get<{ entries: { entryId: string; facility: string; date: string }[] }>('/experience');
  return clinicalLinkOptions(res.entries);
}

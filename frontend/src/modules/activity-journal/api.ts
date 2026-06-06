// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { Activity, ActivityInput, ActivitySummary, ListFilters } from './types';

export async function listActivities(filters: ListFilters = {}): Promise<Activity[]> {
  const res = await api.get<{ activities: Activity[] }>('/activities', {
    query: { category: filters.category, from: filters.from, to: filters.to },
  });
  return res.activities;
}

export function getActivity(id: string): Promise<Activity> {
  return api.get<Activity>(`/activities/${encodeURIComponent(id)}`);
}

export function createActivity(input: ActivityInput): Promise<Activity> {
  return api.post<Activity>('/activities', input);
}

export function updateActivity(id: string, patch: Partial<ActivityInput>): Promise<Activity> {
  return api.put<Activity>(`/activities/${encodeURIComponent(id)}`, patch);
}

export function deleteActivity(id: string): Promise<void> {
  return api.del<void>(`/activities/${encodeURIComponent(id)}`);
}

export function getSummary(): Promise<ActivitySummary> {
  return api.get<ActivitySummary>('/activities/summary');
}

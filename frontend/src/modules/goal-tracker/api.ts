// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { Goal, GoalInput, ListFilters, SuggestedGoal, SuggestInput } from './types';

export async function listGoals(filters: ListFilters = {}): Promise<Goal[]> {
  const res = await api.get<{ goals: Goal[] }>('/goals', {
    query: { period: filters.period, status: filters.status, category: filters.category },
  });
  return res.goals;
}

export function getGoal(id: string): Promise<Goal> {
  return api.get<Goal>(`/goals/${encodeURIComponent(id)}`);
}

export function createGoal(input: GoalInput): Promise<Goal> {
  return api.post<Goal>('/goals', input);
}

export function updateGoal(id: string, patch: Partial<GoalInput>): Promise<Goal> {
  return api.put<Goal>(`/goals/${encodeURIComponent(id)}`, patch);
}

export function deleteGoal(id: string): Promise<void> {
  return api.del<void>(`/goals/${encodeURIComponent(id)}`);
}

export async function suggestGoals(input: SuggestInput): Promise<SuggestedGoal[]> {
  const res = await api.post<{ suggestions: SuggestedGoal[] }>('/goals/suggest', input);
  return res.suggestions;
}

import { api } from '../../shared/api';
import type { FinAidItem, FinAidKind, FinAidStatus, FinAidSummary } from './types';

export async function listFinAid(filters?: { kind?: FinAidKind; status?: FinAidStatus }): Promise<FinAidItem[]> {
  const res = await api.get<{ items: FinAidItem[] }>('/finaid', {
    query: { kind: filters?.kind, status: filters?.status },
  });
  return res.items;
}

export function createFinAid(input: Partial<FinAidItem> & { kind: FinAidKind; title: string }): Promise<FinAidItem> {
  return api.post<FinAidItem>('/finaid', input);
}

export function updateFinAid(id: string, patch: Partial<FinAidItem>): Promise<FinAidItem> {
  return api.put<FinAidItem>(`/finaid/${encodeURIComponent(id)}`, patch);
}

export function deleteFinAid(id: string): Promise<void> {
  return api.del<void>(`/finaid/${encodeURIComponent(id)}`);
}

export function seedFinAid(classYear: number): Promise<{ added: number; items: FinAidItem[] }> {
  return api.post<{ added: number; items: FinAidItem[] }>('/finaid/seed', { classYear });
}

export function getFinAidSummary(): Promise<FinAidSummary> {
  return api.get<FinAidSummary>('/finaid/summary');
}

import { api } from '../../shared/api';
import type {
  DiscoveryJob,
  Opportunity,
  OpportunityCandidate,
  OpportunityStatus,
  OpportunityType,
} from './types';

export async function listOpportunities(filters?: {
  type?: OpportunityType;
  status?: OpportunityStatus;
  search?: string;
}): Promise<Opportunity[]> {
  const res = await api.get<{ opportunities: Opportunity[] }>('/opportunities', {
    query: { type: filters?.type, status: filters?.status, search: filters?.search },
  });
  return res.opportunities;
}

export function updateOpportunity(id: string, patch: Partial<Opportunity>): Promise<Opportunity> {
  return api.put<Opportunity>(`/opportunities/${encodeURIComponent(id)}`, patch);
}

export function deleteOpportunity(id: string): Promise<void> {
  return api.del<void>(`/opportunities/${encodeURIComponent(id)}`);
}

export function startDiscovery(filters: {
  type?: OpportunityType;
  location?: string;
  query?: string;
}): Promise<DiscoveryJob> {
  return api.post<DiscoveryJob>('/opportunities/discover', filters);
}

export function pollDiscovery(jobId: string): Promise<DiscoveryJob> {
  return api.get<DiscoveryJob>(`/opportunities/discover/${encodeURIComponent(jobId)}`);
}

export function bulkAdd(items: OpportunityCandidate[]): Promise<{ added: number; opportunities: Opportunity[] }> {
  return api.post<{ added: number; opportunities: Opportunity[] }>('/opportunities/bulk-add', { items });
}

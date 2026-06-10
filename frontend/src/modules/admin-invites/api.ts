import { api } from '../../shared/api';
import type { Invite } from './types';

export async function listInvites(): Promise<Invite[]> {
  return (await api.get<{ invites: Invite[] }>('/admin/invites')).invites;
}

export function createInvite(input: {
  email: string;
  familyName?: string;
  plan?: 'free' | 'family';
  expiresInDays?: number;
}): Promise<Invite> {
  return api.post<Invite>('/admin/invites', input);
}

export function revokeInvite(code: string): Promise<Invite> {
  return api.post<Invite>(`/admin/invites/${encodeURIComponent(code)}/revoke`, {});
}

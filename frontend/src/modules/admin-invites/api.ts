import { api } from '../../shared/api';
import type { Invite } from './types';

export async function listInvites(): Promise<Invite[]> {
  return (await api.get<{ invites: Invite[] }>('/admin/invites')).invites;
}

/** Create an invite. With `email` the code is emailed too; without, it's link-only. The response
 *  always carries the ready-to-share redemption `url`. */
export function createInvite(input: {
  email?: string;
  familyName?: string;
  plan?: 'free' | 'family';
  expiresInDays?: number;
}): Promise<Invite & { url: string }> {
  return api.post<Invite & { url: string }>('/admin/invites', input);
}

export function revokeInvite(code: string): Promise<Invite> {
  return api.post<Invite>(`/admin/invites/${encodeURIComponent(code)}/revoke`, {});
}

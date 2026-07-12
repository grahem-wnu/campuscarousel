// Admin invite console types (SaaS sub-project 2) — mirrors the backend Invite.

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invite {
  code: string;
  email: string;
  familyName?: string;
  plan: 'free' | 'family';
  status: InviteStatus;
  invitedBy: string;
  expiresAt?: string;
  acceptedTenantId?: string;
  createdAt: string;
  updatedAt: string;
}

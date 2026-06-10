// Pure invite logic (SaaS sub-project 2): code generation + redeemability checks. Framework-free so it
// unit-tests for real. A super-admin issues a single-use code to a family's email; redeeming provisions
// a tenant.

import { randomBytes } from 'node:crypto';
import type { Invite } from '../../shared/data/index.js';

// No ambiguous characters (0/O, 1/I/L) so codes are easy to read off an email and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export const DEFAULT_INVITE_TTL_DAYS = 30;

export function expiresAt(now: Date, days = DEFAULT_INVITE_TTL_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Returns a human error if the invite can't be redeemed by `email` at `nowIso`, or null if it can. */
export function inviteRedeemError(invite: Invite | null, email: string, nowIso: string): string | null {
  if (!invite) return 'Invalid invite code.';
  if (invite.status === 'revoked') return 'This invite has been revoked.';
  if (invite.status === 'accepted') return 'This invite has already been used.';
  if (invite.status === 'expired' || (invite.expiresAt && invite.expiresAt < nowIso)) {
    return 'This invite has expired.';
  }
  if (invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return 'This invite was issued to a different email address.';
  }
  return null;
}

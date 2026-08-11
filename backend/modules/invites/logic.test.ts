import { describe, expect, it } from 'vitest';
import type { Invite } from '../../shared/data/index.js';
import { expiresAt, inviteRedeemError, newInviteCode } from './logic.js';

const invite = (over: Partial<Invite> = {}): Invite => ({
  code: 'ABC',
  email: 'fam@x.com',
  plan: 'free',
  status: 'pending',
  invitedBy: 'grahem',
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
});

describe('newInviteCode', () => {
  it('produces an 8-char unambiguous code', () => {
    expect(newInviteCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
});

describe('expiresAt', () => {
  it('adds the default 30-day TTL', () => {
    expect(expiresAt(new Date('2026-06-10T00:00:00Z')).slice(0, 10)).toBe('2026-07-10');
  });
});

describe('inviteRedeemError', () => {
  const now = '2026-06-10T00:00:00.000Z';
  it('returns null when redeemable', () => {
    expect(inviteRedeemError(invite({ expiresAt: '2026-07-10T00:00:00Z' }), 'fam@x.com', now)).toBeNull();
  });
  it('is case-insensitive on the email', () => {
    expect(inviteRedeemError(invite(), 'FAM@X.com', now)).toBeNull();
  });
  it('a link-only invite (no pinned email) is redeemable by any email', () => {
    expect(inviteRedeemError(invite({ email: undefined }), 'whoever@else.com', now)).toBeNull();
  });
  it('rejects unknown / revoked / used / expired / email-mismatch', () => {
    expect(inviteRedeemError(null, 'a@b.com', now)).toMatch(/Invalid/);
    expect(inviteRedeemError(invite({ status: 'revoked' }), 'fam@x.com', now)).toMatch(/revoked/);
    expect(inviteRedeemError(invite({ status: 'accepted' }), 'fam@x.com', now)).toMatch(/already/);
    expect(inviteRedeemError(invite({ expiresAt: '2026-01-01T00:00:00Z' }), 'fam@x.com', now)).toMatch(/expired/);
    expect(inviteRedeemError(invite(), 'other@x.com', now)).toMatch(/different email/);
  });
});

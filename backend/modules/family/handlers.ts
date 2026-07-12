// Family-member management (multi-tenant SaaS). A family isn't just parents — grandparents, aunts/
// uncles, siblings, family friends, counselors and mentors can all be given access. Two axes:
//   • relationship — descriptive (who they are)
//   • accessLevel  — what they can do: 'manager' (full, JWT role 'parent') or 'viewer' (read-only,
//     JWT role 'member' — the router blocks their writes; they never see the student's private entries)
// The member records are family-level (tenant-scoped). Listing is open to any family role so everyone
// can see who's on the account; inviting / re-roling / removing is admin+parent only. Account creation
// goes through the FamilyInviter seam (Cognito in prod), so this logic unit-tests without AWS.

import { Errors, validateBody, validateParams, type Handler } from '../../shared/api/index.js';
import { requireRole, type Role } from '../../shared/auth/index.js';
import { currentTenantId } from '../../shared/tenant/index.js';
import type { Data, MemberAccessLevel } from '../../shared/data/index.js';
import { sesSenderFromEnv, type EmailSender } from '../../shared/email/index.js';
import { expiresAt, newInviteCode } from '../invites/logic.js';
import {
  createFamilyInviteSchema,
  familyInviteParamSchema,
  inviteMemberSchema,
  memberParamSchema,
  updateMemberSchema,
} from './schema.js';

/** Family invites live for 7 days by default (shorter than the front-door tenant invite's 30). */
const FAMILY_INVITE_TTL_DAYS = 7;

/** Seam for creating / re-roling / removing a member's login (Cognito in production). */
export interface FamilyInviter {
  inviteMember(input: { email: string; tenantId: string; role: Role; temporaryPassword: string }): Promise<void>;
  setRole(input: { email: string; role: Role }): Promise<void>;
  removeMember(input: { email: string }): Promise<void>;
}

export interface FamilyHandlers {
  list: Handler;
  invite: Handler;
  update: Handler;
  remove: Handler;
  createInvite: Handler;
  listInvites: Handler;
  revokeInvite: Handler;
}

export interface FamilyDeps {
  getData: () => Data;
  inviter: FamilyInviter;
  sender?: EmailSender;
  from?: string;
  appUrl?: string;
  /** Generate a temporary password (injected for tests). */
  genPassword?: () => string;
  /** Generate an invite code (injected for tests). */
  genCode?: () => string;
  now?: () => Date;
}

/** Access level → enforced JWT permission role. Manager = a guardian; viewer = read-only supporter. */
export const roleForAccess = (level: MemberAccessLevel): Role => {
  switch (level) {
    case 'manager':
      return 'parent';
    case 'viewer':
      return 'member';
  }
};

const requireManager = requireRole('admin', 'parent');

/** A temporary password that satisfies a typical Cognito policy (upper, lower, digit, symbol, ≥8). */
function defaultTempPassword(): string {
  const bytes = Buffer.from(
    globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(12))
      : Uint8Array.from({ length: 12 }, (_, i) => (i * 37 + 11) % 256),
  ).toString('base64url');
  return `Aa1!${bytes}`;
}

export function makeHandlers(deps: FamilyDeps): FamilyHandlers {
  const { getData, inviter } = deps;
  const sender = deps.sender ?? sesSenderFromEnv();
  const from = deps.from ?? process.env.REMINDER_SENDER_EMAIL ?? '';
  const appUrl = deps.appUrl ?? process.env.APP_URL ?? 'https://app';
  const genPassword = deps.genPassword ?? defaultTempPassword;
  const genCode = deps.genCode ?? newInviteCode;
  const now = deps.now ?? (() => new Date());

  return {
    // GET /family/members — anyone in the family can see who has access.
    list: async () => ({ status: 200, body: { members: await getData().members.list() } }),

    // POST /family/members — invite someone into this family (admin/parent only).
    invite: async (ctx) => {
      requireManager(ctx.requester);
      const input = validateBody(inviteMemberSchema, ctx);
      if (!from) throw Errors.conflict('Sender email is not configured on the server.');
      const tenantId = currentTenantId();
      const role = roleForAccess(input.accessLevel);

      const existing = await getData().members.get(input.email);
      if (existing) throw Errors.conflict('That person is already on the account.');

      const temporaryPassword = genPassword();
      await inviter.inviteMember({ email: input.email, tenantId, role, temporaryPassword });

      const member = await getData().members.put({
        userId: input.email,
        email: input.email,
        displayName: input.displayName,
        relationship: input.relationship,
        accessLevel: input.accessLevel,
        status: 'active',
        invitedBy: ctx.requester.username,
      });

      const family = await getData().tenants.get(tenantId);
      const familyName = family?.familyName ?? 'your family';
      // Best-effort email: the login + member record already exist, so a mail failure (e.g. SES sandbox
      // can't reach an unverified address) must NOT fail the invite. Report whether it went out so the
      // UI can tell the inviter to share the credentials another way.
      let emailed = true;
      try {
        await sender.send({
          from,
          to: input.email,
          subject: `You've been added to ${familyName}'s account`,
          text: `${ctx.requester.username} added you to ${familyName}'s account.\n\nSign in at ${appUrl}\nUsername: ${input.email}\nTemporary password: ${temporaryPassword}\n\nYou'll choose your own password the first time you sign in.`,
          html: `<p><strong>${ctx.requester.username}</strong> added you to <strong>${familyName}</strong>'s account.</p><p><a href="${appUrl}">Sign in</a></p><p>Username: <strong>${input.email}</strong><br/>Temporary password: <strong>${temporaryPassword}</strong></p><p style="color:#666;font-size:12px">You'll choose your own password the first time you sign in.</p>`,
        });
      } catch (err) {
        emailed = false;
        console.error('family invite: email send failed (member still created)', input.email, err);
      }
      return { status: 201, body: { ...member, emailed } };
    },

    // PATCH /family/members/:userId — change relationship / access level (admin/parent only).
    update: async (ctx) => {
      requireManager(ctx.requester);
      const { userId } = validateParams(memberParamSchema, ctx);
      const patch = validateBody(updateMemberSchema, ctx);
      const existing = await getData().members.get(userId);
      if (!existing) throw Errors.notFound('Member not found');
      // If access level changes, update their login role so the router's enforcement follows.
      // Only applies to email-based logins; code-invited members (no email) are keyed differently.
      if (patch.accessLevel && patch.accessLevel !== existing.accessLevel && existing.email) {
        await inviter.setRole({ email: existing.email, role: roleForAccess(patch.accessLevel) });
      }
      return { status: 200, body: await getData().members.update(userId, patch) };
    },

    // DELETE /family/members/:userId — revoke access entirely (admin/parent only).
    remove: async (ctx) => {
      requireManager(ctx.requester);
      const { userId } = validateParams(memberParamSchema, ctx);
      const existing = await getData().members.get(userId);
      if (!existing) throw Errors.notFound('Member not found');
      // Only email-based logins are provisioned in Cognito by email; skip for code-invited members.
      if (existing.email) await inviter.removeMember({ email: existing.email });
      await getData().members.delete(userId);
      return { status: 204, body: undefined };
    },

    // POST /family/invites — mint a shareable single-use join code (admin/parent only). No Cognito user
    // and no email are created here: the invitee redeems the code on the PUBLIC accept endpoint, choosing
    // their own login name + password. A student invite must target an existing, not-yet-linked roster id.
    createInvite: async (ctx) => {
      requireManager(ctx.requester);
      const input = validateBody(createFamilyInviteSchema, ctx);
      const tenantId = currentTenantId();
      if (input.kind === 'student') {
        const child = await getData().students.get(input.studentId!);
        if (!child) throw Errors.notFound('Student not found');
        if (child.loginUserId) throw Errors.conflict('That child already has a login.');
      }
      const code = genCode();
      const invite = await getData().familyInvites.create({
        code,
        tenantId,
        kind: input.kind,
        ...(input.relationship ? { relationship: input.relationship } : {}),
        ...(input.studentId ? { studentId: input.studentId } : {}),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        invitedBy: ctx.requester.username,
        status: 'pending',
        expiresAt: expiresAt(now(), FAMILY_INVITE_TTL_DAYS),
      });
      return { status: 201, body: { code: invite.code, url: `${appUrl}/join-family?code=${invite.code}` } };
    },

    // GET /family/invites — the tenant's still-pending invites (admin/parent only).
    listInvites: async () => {
      const all = await getData().familyInvites.listForTenant(currentTenantId());
      return { status: 200, body: { invites: all.filter((i) => i.status === 'pending') } };
    },

    // POST /family/invites/:code/revoke — cancel a pending invite (admin/parent only). Cross-tenant codes
    // are invisible (404), so a manager can only revoke their own family's invites.
    revokeInvite: async (ctx) => {
      const { code } = validateParams(familyInviteParamSchema, ctx);
      const existing = await getData().familyInvites.get(code);
      if (!existing || existing.tenantId !== currentTenantId()) throw Errors.notFound('Invite not found');
      return { status: 200, body: await getData().familyInvites.update(code, { status: 'revoked' }) };
    },
  };
}

/** Single source of truth for the route table. */
export function buildRoutes(h: FamilyHandlers) {
  return [
    { method: 'GET' as const, path: '/family/members', handler: h.list },
    { method: 'POST' as const, path: '/family/members', handler: h.invite },
    { method: 'PATCH' as const, path: '/family/members/:userId', handler: h.update },
    { method: 'DELETE' as const, path: '/family/members/:userId', handler: h.remove },
    { method: 'POST' as const, path: '/family/invites', handler: h.createInvite, roles: ['admin', 'parent'] as Role[] },
    { method: 'GET' as const, path: '/family/invites', handler: h.listInvites, roles: ['admin', 'parent'] as Role[] },
    { method: 'POST' as const, path: '/family/invites/:code/revoke', handler: h.revokeInvite, roles: ['admin', 'parent'] as Role[] },
  ];
}

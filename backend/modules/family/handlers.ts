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
import { inviteMemberSchema, memberParamSchema, updateMemberSchema } from './schema.js';

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
}

export interface FamilyDeps {
  getData: () => Data;
  inviter: FamilyInviter;
  sender?: EmailSender;
  from?: string;
  appUrl?: string;
  /** Generate a temporary password (injected for tests). */
  genPassword?: () => string;
}

/** Access level → enforced JWT permission role. Manager = a guardian; viewer = read-only supporter. */
export const roleForAccess = (level: MemberAccessLevel): Role => (level === 'manager' ? 'parent' : 'member');

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
      await sender.send({
        from,
        to: input.email,
        subject: `You've been added to ${familyName}'s account`,
        text: `${ctx.requester.username} added you to ${familyName}'s account.\n\nSign in at ${appUrl}\nUsername: ${input.email}\nTemporary password: ${temporaryPassword}\n\nYou'll choose your own password the first time you sign in.`,
        html: `<p><strong>${ctx.requester.username}</strong> added you to <strong>${familyName}</strong>'s account.</p><p><a href="${appUrl}">Sign in</a></p><p>Username: <strong>${input.email}</strong><br/>Temporary password: <strong>${temporaryPassword}</strong></p><p style="color:#666;font-size:12px">You'll choose your own password the first time you sign in.</p>`,
      });
      return { status: 201, body: member };
    },

    // PATCH /family/members/:userId — change relationship / access level (admin/parent only).
    update: async (ctx) => {
      requireManager(ctx.requester);
      const { userId } = validateParams(memberParamSchema, ctx);
      const patch = validateBody(updateMemberSchema, ctx);
      const existing = await getData().members.get(userId);
      if (!existing) throw Errors.notFound('Member not found');
      // If access level changes, update their login role so the router's enforcement follows.
      if (patch.accessLevel && patch.accessLevel !== existing.accessLevel) {
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
      await inviter.removeMember({ email: existing.email });
      await getData().members.delete(userId);
      return { status: 204, body: undefined };
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
  ];
}

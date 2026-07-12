// Super-admin invite handlers (SaaS sub-project 2): issue a single-use signup code to a family's email
// (emailed via the shared SES sender), list invites, and revoke. All routes are platform-admin only and
// run WITHOUT a tenant context (they touch the global invite registry). Redemption is a separate public
// path (redeem.ts).

import { Errors, validateBody, validateParams, type Handler } from '../../shared/api/index.js';
import type { Data } from '../../shared/data/index.js';
import { sesSenderFromEnv, type EmailSender } from '../../shared/email/index.js';
import { expiresAt, newInviteCode } from './logic.js';
import { codeParamSchema, createInviteSchema } from './schema.js';

export interface InviteHandlers {
  create: Handler;
  list: Handler;
  revoke: Handler;
}

export interface InviteDeps {
  getData: () => Data;
  sender?: EmailSender;
  from?: string;
  appUrl?: string;
  now?: () => Date;
}

export function makeHandlers(deps: InviteDeps): InviteHandlers {
  const { getData } = deps;
  const sender = deps.sender ?? sesSenderFromEnv();
  const from = deps.from ?? process.env.REMINDER_SENDER_EMAIL ?? '';
  const appUrl = deps.appUrl ?? process.env.APP_URL ?? 'https://keirasjourney.com';
  const now = deps.now ?? (() => new Date());

  return {
    // POST /admin/invites — issue a code + email it.
    create: async (ctx) => {
      const input = validateBody(createInviteSchema, ctx);
      if (!from) throw Errors.conflict('Sender email is not configured on the server.');
      const code = newInviteCode();
      const invite = await getData().invites.create({
        code,
        email: input.email,
        familyName: input.familyName,
        plan: input.plan ?? 'free',
        status: 'pending',
        invitedBy: ctx.requester.username,
        expiresAt: expiresAt(now(), input.expiresInDays),
      });
      const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(code)}`;
      await sender.send({
        from,
        to: input.email,
        subject: "You're invited to Campus Carousel",
        text: `You've been invited to Campus Carousel — a private space to track a student's path to college.\n\nYour signup code: ${code}\n\nCreate your family account: ${redeemUrl}\n\nThis code expires ${invite.expiresAt}.`,
        html: `<p>You've been invited to <strong>Campus Carousel</strong> — a private space to track a student's path to college.</p><p>Your signup code: <strong>${code}</strong></p><p><a href="${redeemUrl}">Create your family account</a></p><p style="color:#666;font-size:12px">This code expires ${invite.expiresAt}.</p>`,
      });
      return { status: 201, body: invite };
    },

    // GET /admin/invites — list all invites (newest first).
    list: async () => {
      return { status: 200, body: { invites: await getData().invites.list() } };
    },

    // POST /admin/invites/:code/revoke
    revoke: async (ctx) => {
      const { code } = validateParams(codeParamSchema, ctx);
      const existing = await getData().invites.get(code);
      if (!existing) throw Errors.notFound('Invite not found');
      return { status: 200, body: await getData().invites.update(code, { status: 'revoked' }) };
    },
  };
}

/** Single source of truth for the route table (platform-admin only). */
export function buildRoutes(h: InviteHandlers) {
  return [
    { method: 'POST' as const, path: '/admin/invites', handler: h.create, platformAdmin: true },
    { method: 'GET' as const, path: '/admin/invites', handler: h.list, platformAdmin: true },
    { method: 'POST' as const, path: '/admin/invites/:code/revoke', handler: h.revoke, platformAdmin: true },
  ];
}

// Input validation for the super-admin invite endpoints (SaaS sub-project 2).

import { z } from '../../shared/api/index.js';

// `email` optional: with it, the code is emailed AND redemption is pinned to that address; without
// it, the endpoint returns a shareable link the admin copies and sends over any channel.
export const createInviteSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    familyName: z.string().max(120).optional(),
    plan: z.enum(['free', 'family']).optional(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();

export const codeParamSchema = z.object({ code: z.string().min(1).max(64) }).strict();

// Public redemption body (used by the unauthenticated redeem entry; validated there).
export const redeemSchema = z
  .object({
    code: z.string().min(1).max(64),
    email: z.string().email().max(320),
    password: z.string().min(8).max(256),
    familyName: z.string().max(120).optional(),
  })
  .strict();

// Public open-signup body (the redeem body minus the invite code; validated at the same entry).
// `familyName` is REQUIRED here (unlike redeem, where the invite record carries the name): open
// signup has no other source for it, and a blank name renders every such family as an
// indistinguishable "Family" row on the admin Usage page.
export const signupSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(256),
    familyName: z.string().trim().min(1).max(120),
  })
  .strict();

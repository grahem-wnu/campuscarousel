// Input validation for the super-admin invite endpoints (SaaS sub-project 2).

import { z } from '../../shared/api/index.js';

export const createInviteSchema = z
  .object({
    email: z.string().email().max(320),
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

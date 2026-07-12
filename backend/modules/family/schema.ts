// Input validation for family-member management (invite the wider support circle, not just parents).

import { z } from '../../shared/api/index.js';

const relationship = z.enum([
  'parent',
  'grandparent',
  'aunt-uncle',
  'sibling',
  'family-friend',
  'counselor',
  'mentor',
  'other',
]);

const accessLevel = z.enum(['manager', 'viewer']);

export const inviteMemberSchema = z
  .object({
    email: z.string().email().max(320),
    displayName: z.string().max(120).optional(),
    relationship,
    accessLevel,
  })
  .strict();

export const updateMemberSchema = z
  .object({
    displayName: z.string().max(120).optional(),
    relationship: relationship.optional(),
    accessLevel: accessLevel.optional(),
  })
  .strict();

export const memberParamSchema = z.object({ userId: z.string().min(1).max(320) }).strict();

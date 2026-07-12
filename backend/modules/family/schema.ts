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

// Create a shareable family invite. `kind` picks the login role; co-parent/viewer need a descriptive
// `relationship`; student needs the roster `studentId` it links to. The invitee chooses their own login
// name + password later (at accept time) — no email here.
export const createFamilyInviteSchema = z
  .object({
    kind: z.enum(['coparent', 'viewer', 'student']),
    relationship: relationship.optional(),
    studentId: z.string().min(1).max(64).optional(),
    displayName: z.string().max(120).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'student') {
      if (!v.studentId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'studentId is required for a student invite', path: ['studentId'] });
    } else if (!v.relationship) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relationship is required for a co-parent/viewer invite', path: ['relationship'] });
    }
  });

export const familyInviteParamSchema = z.object({ code: z.string().min(1).max(64) }).strict();

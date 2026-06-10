// Input validation for the student-profile endpoints (v2.1 F4). All fields optional so the
// onboarding wizard can save one step at a time. `.strict()` rejects unknown fields (→ 422).

import { z } from '../../shared/api/index.js';

const activity = z
  .object({
    name: z.string().min(1).max(200),
    type: z.string().max(80).optional(),
    organization: z.string().max(200).optional(),
  })
  .strict();

export const profileBodySchema = z
  .object({
    name: z.string().max(120).optional(),
    highSchool: z.string().max(200).optional(),
    district: z.string().max(200).optional(),
    location: z.string().max(200).optional(),
    graduationYear: z.number().int().min(2000).max(2100).optional(),
    currentGPA: z.number().min(0).max(6).optional(),
    gpaType: z.enum(['weighted', 'unweighted']).optional(),
    careerGoal: z.string().max(500).optional(),
    dreamSchool: z.string().max(200).optional(),
    interests: z.array(z.string().max(80)).max(50).optional(),
    currentActivities: z.array(activity).max(50).optional(),
    budget: z
      .object({
        total: z.number().min(0).optional(),
        currency: z.literal('USD').optional(),
        notes: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
    onboardingComplete: z.boolean().optional(),
  })
  .strict();

export type ProfileBody = z.infer<typeof profileBodySchema>;

// Input validation for the conversational onboarding endpoints.

import { z } from '../../shared/api/index.js';

const chatMsgSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

export const chatSchema = z.object({
  messages: z.array(chatMsgSchema).min(1).max(40),
});

// The profile the chat gathered. NOT strict and numeric fields are coerced, because this object comes
// from the model's JSON (relayed through the client) — unknown keys are dropped, "4.0" becomes 4.0,
// rather than 422-ing the family at the finish line.
const onboardingProfileSchema = z.object({
  name: z.string().max(120).optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2100).optional(),
  currentGPA: z.coerce.number().min(0).max(6).optional(),
  gpaType: z.enum(['weighted', 'unweighted']).optional(),
  careerGoal: z.string().max(500).optional(),
  intendedMajors: z.array(z.string().max(80)).max(10).optional(),
  location: z.string().max(200).optional(),
  highSchool: z.string().max(200).optional(),
  interests: z.array(z.string().max(80)).max(50).optional(),
  collegesOfInterest: z.array(z.string().max(120)).max(15).optional(),
  budgetTotal: z.coerce.number().min(0).optional(),
});

export const finishSchema = z.object({
  profile: onboardingProfileSchema,
});

export type ChatBody = z.infer<typeof chatSchema>;
export type FinishBody = z.infer<typeof finishSchema>;

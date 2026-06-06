// Request validation for the Interview Prep endpoints (specs/foundational/api.md). Field names mirror
// the data-layer `Interview` type (frozen contract).

import { z } from '../../shared/api/index.js';

export const INTERVIEW_TYPES = ['mock-practice', 'real-interview'] as const;

/** Question-bank categories. */
export const QUESTION_CATEGORIES = [
  'motivation',
  'behavioral',
  'clinical',
  'situational',
  'school-specific',
  'ethics',
  'general',
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const questionEntry = z
  .object({
    question: z.string().min(1).max(2000),
    answer: z.string().max(20000).optional(),
    aiFeedback: z.string().max(20000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    linkedActivities: z.array(z.string().min(1)).max(50).optional(),
  })
  .strict();

/** Body for POST /interviews. */
export const createSchema = z
  .object({
    type: z.enum(INTERVIEW_TYPES),
    date: isoDate,
    collegeId: z.string().max(200).optional(),
    questions: z.array(questionEntry).max(100).optional(),
    overallNotes: z.string().max(20000).optional(),
    confidenceLevel: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const updateSchema = createSchema.partial();

export const listQuerySchema = z.object({
  type: z.enum(INTERVIEW_TYPES).optional(),
});

/** POST /interviews/mock — start an AI mock; optional school + how many questions. */
export const mockStartSchema = z
  .object({
    collegeId: z.string().max(200).optional(),
    school: z.string().max(200).optional(),
    count: z.number().int().min(1).max(15).optional(),
  })
  .strict();

/** POST /interviews/mock/:sessionId/answer — submit an answer to a question by index. */
export const answerSchema = z
  .object({
    questionIndex: z.number().int().min(0).max(100),
    answer: z.string().min(1).max(20000),
  })
  .strict();

/** GET /interviews/questions — filter the bank. */
export const questionQuerySchema = z.object({
  category: z.enum(QUESTION_CATEGORIES).optional(),
  search: z.string().max(200).optional(),
});

/** POST /interviews/questions — add a custom bank question. */
export const addQuestionSchema = z
  .object({
    question: z.string().min(1).max(2000),
    category: z.enum(QUESTION_CATEGORIES).optional(),
    starred: z.boolean().optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) });
export const sessionParamSchema = z.object({ sessionId: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type MockStartInput = z.infer<typeof mockStartSchema>;
export type AnswerInput = z.infer<typeof answerSchema>;
export type QuestionQuery = z.infer<typeof questionQuerySchema>;
export type AddQuestionInput = z.infer<typeof addQuestionSchema>;

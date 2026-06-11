// Request validation for the Exam Prep endpoints. Every handler validates input with one of these
// before touching the data layer (specs/foundational/api.md). Field names mirror the data-layer
// `ExamScore` type (frozen contract).

import { z } from '../../shared/api/index.js';

export const EXAM_TYPES = ['practice-test', 'study-session', 'official-exam'] as const;

/** The four exam sections. */
export const SECTIONS = ['reading', 'math', 'science', 'englishLanguageUsage'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');
const score = z.number().min(0).max(100);

const sectionScores = z
  .object({
    reading: score.optional(),
    math: score.optional(),
    science: score.optional(),
    englishLanguageUsage: score.optional(),
  })
  .strict();

/** Body for POST /exams. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    type: z.enum(EXAM_TYPES),
    date: isoDate,
    /** Which exam (e.g. "TEAS"); defaults from the student's major pack when omitted. */
    examName: z.string().min(1).max(80).optional(),
    overallScore: score.optional(),
    sectionScores: sectionScores.optional(),
    source: z.string().max(200).optional(),
    studyTopics: z.array(z.string().min(1).max(120)).max(50).optional(),
    studyDuration: z.number().nonnegative().max(10000).optional(),
    weakAreas: z.array(z.string().min(1).max(120)).max(50).optional(),
    strongAreas: z.array(z.string().min(1).max(120)).max(50).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strict();

/** Body for PUT /exams/:id — every field optional. */
export const updateSchema = createSchema.partial();

/** GET /exams query — optional type filter. */
export const listQuerySchema = z.object({
  type: z.enum(EXAM_TYPES).optional(),
});

/** Body for POST /exams/study-plan — overrides are optional; the handler fills gaps from the records. */
export const studyPlanSchema = z
  .object({
    examDate: isoDate.optional(),
    targetScore: score.optional(),
    targetSchools: z.array(z.string().min(1).max(200)).max(50).optional(),
    hoursPerWeek: z.number().positive().max(168).optional(),
    focusAreas: z.array(z.string().min(1).max(120)).max(20).optional(),
  })
  .strict();

/** Body for POST /exams/analyze — optional target context; trend comes from stored records. */
export const analyzeSchema = z
  .object({
    targetScore: score.optional(),
    examDate: isoDate.optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type StudyPlanInput = z.infer<typeof studyPlanSchema>;
export type AnalyzeInput = z.infer<typeof analyzeSchema>;

// Request validation for the Course Planner endpoints. Every handler validates input with one of
// these before touching the data layer (specs/foundational/api.md); a failure → 422 envelope.
// Courses are family-visible (no `visibility` field), so there is no privacy rule here.

import { z } from '../../shared/api/index.js';

export const COURSE_TYPES = ['regular', 'honors', 'AP', 'dual-enrollment'] as const;
export const SUBJECTS = [
  'math',
  'science',
  'english',
  'social-studies',
  'world-language',
  'elective',
  'health-sciences',
] as const;
export const YEARS = ['freshman', 'sophomore', 'junior', 'senior'] as const;
export const SEMESTERS = ['fall', 'spring', 'full-year', 'summer'] as const;

const prereqLink = z.object({
  collegeId: z.string().min(1).max(200),
  prereqName: z.string().min(1, 'prereqName is required').max(200),
});

/** Body for POST /courses. `.strict()` rejects unknown fields so typos surface as 422. */
export const createSchema = z
  .object({
    name: z.string().min(1, 'name is required').max(200),
    type: z.enum(COURSE_TYPES).optional(),
    subject: z.enum(SUBJECTS).optional(),
    year: z.enum(YEARS).optional(),
    semester: z.enum(SEMESTERS).optional(),
    grade: z.string().max(5).optional(),
    // Explicit weighted grade-points override; otherwise the GPA endpoint derives them.
    gradePoints: z.number().min(0).max(10).optional(),
    units: z.number().nonnegative().max(100).optional(),
    satisfiesPrereq: z.array(prereqLink).max(200).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strict();

/** Body for PUT /courses/:id — every field optional (e.g. just adding a final grade). */
export const updateSchema = createSchema.partial();

/** Query for GET /courses — unknown params are ignored (API Gateway may add some). */
export const listQuerySchema = z.object({
  year: z.enum(YEARS).optional(),
  subject: z.enum(SUBJECTS).optional(),
});

/** Path params for the by-id routes. */
export const idParamSchema = z.object({ id: z.string().min(1) });

/** Path params for the per-college prerequisite check. */
export const collegeIdParamSchema = z.object({ collegeId: z.string().min(1) });

export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

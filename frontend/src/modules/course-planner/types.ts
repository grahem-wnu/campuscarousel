// Frontend types for Course Planner. These mirror the API responses (the backend's data shapes) —
// the frontend has no access to the backend data-layer package, so the contract is restated here
// and kept in sync via the API. Courses are family-visible — no `visibility` field.

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

export type CourseType = (typeof COURSE_TYPES)[number];
export type Subject = (typeof SUBJECTS)[number];
export type Year = (typeof YEARS)[number];
export type Semester = (typeof SEMESTERS)[number];

export interface PrereqLink {
  collegeId: string;
  prereqName: string;
}

export interface Course {
  courseId: string;
  name: string;
  type?: CourseType;
  subject?: Subject;
  year?: Year;
  semester?: Semester;
  grade?: string;
  gradePoints?: number;
  units?: number;
  satisfiesPrereq?: PrereqLink[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps). */
export interface CourseInput {
  name: string;
  type?: CourseType;
  subject?: Subject;
  year?: Year;
  semester?: Semester;
  grade?: string;
  gradePoints?: number;
  units?: number;
  satisfiesPrereq?: PrereqLink[];
  notes?: string;
}

export interface GpaResult {
  unweighted: number;
  weighted: number;
  gradedUnits: number;
  gradedCount: number;
}

export interface PrereqStatus {
  name: string;
  satisfied: boolean;
  satisfiedByCourseIds: string[];
}

export interface PrereqReport {
  collegeId: string;
  collegeName?: string;
  prerequisites: PrereqStatus[];
  satisfiedCount: number;
  totalCount: number;
  gaps: string[];
}

export interface PrereqMatrixCollege {
  collegeId: string;
  collegeName?: string;
  status?: string;
  satisfiedCount: number;
  totalCount: number;
  gaps: string[];
}

export interface PrereqMatrix {
  colleges: PrereqMatrixCollege[];
  reports: PrereqReport[];
  allPrerequisites: string[];
}

export interface ListFilters {
  year?: Year;
  subject?: Subject;
}

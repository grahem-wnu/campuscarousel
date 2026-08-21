// Frontend types for College Scholarship Research. These mirror the API responses (the backend's
// CollegeScholarship / ScholarshipResearch shapes); the frontend has no access to the backend data
// layer, so the contract is restated here — the same convention College Hub follows.

/** What a stored award is. `all` (below) is a search filter, never a stored value. */
export const CATEGORIES = ['academic', 'athletic', 'other'] as const;
export type ScholarshipCategory = (typeof CATEGORIES)[number];

/** What a search can ask for. */
export const SEARCH_CATEGORIES = ['all', 'academic', 'athletic'] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export type JobStatus = 'pending' | 'in-progress' | 'complete' | 'failed';

export type Competitiveness = 'very-high' | 'high' | 'moderate' | 'accessible' | 'unknown';

export interface ResearchPoint {
  label: string;
  detail?: string;
}

export interface ResearchDeadline {
  label: string;
  date?: string;
  detail?: string;
}

export interface ResearchContact {
  name?: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  office?: string;
  note?: string;
}

export interface ResearchSource {
  url: string;
  title?: string;
}

export interface ScholarshipResearch {
  summary?: string;
  award?: {
    amount?: string;
    renewable?: string;
    numberAwarded?: string;
    duration?: string;
    stackable?: string;
  };
  odds?: {
    competitiveness?: Competitiveness;
    estimate?: string;
    applicantPool?: string;
    selectionRate?: string;
    whatSetsWinnersApart?: string[];
  };
  howToWin?: ResearchPoint[];
  whatToExpect?: ResearchPoint[];
  applicationSteps?: ResearchPoint[];
  requiredMaterials?: string[];
  deadlines?: ResearchDeadline[];
  contacts?: ResearchContact[];
  staff?: ResearchContact[];
  tips?: string[];
  redFlags?: string[];
  applicationUrl?: string;
  sources?: ResearchSource[];
  asOf?: string;
}

export interface CollegeScholarship {
  collegeId: string;
  scholarshipId: string;
  name: string;
  category?: ScholarshipCategory;
  sport?: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  deadline?: string;
  url?: string;
  summary?: string;
  renewable?: boolean;
  eligibility?: string[];
  research?: ScholarshipResearch;
  researchStatus?: JobStatus;
  researchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Per-college search lifecycle. `null` until the first search has ever been started. */
export interface ScholarshipSearchState {
  collegeId: string;
  status: JobStatus;
  /** What the family typed for the last run. Absent means it was a broad sweep. */
  query?: string;
  category?: SearchCategory;
  sport?: string;
  found?: number;
  error?: string;
  lastRunAt?: string;
}

/** GET /colleges/:id/scholarships (and the 202 body from starting a search). */
export interface ScholarshipsResponse {
  search: ScholarshipSearchState | null;
  scholarships: CollegeScholarship[];
}

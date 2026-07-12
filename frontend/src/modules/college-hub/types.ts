// Frontend types for College Hub. Mirror the API responses (the backend College shape); the frontend
// has no access to the backend data-layer package, so the contract is restated here.

export const COLLEGE_STATUSES = [
  'researching',
  'considering',
  'target',
  'applying',
  'applied',
  'accepted',
  'rejected',
  'enrolled',
  'removed',
] as const;
export type CollegeStatus = (typeof COLLEGE_STATUSES)[number];

export const PROGRAM_TYPES = [
  'direct-admit',
  'secondary-application',
  'accelerated',
  'transfer-pathway',
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export type HydrationStatus = 'pending' | 'in-progress' | 'complete' | 'partial' | 'failed';
export type AssetsStatus = 'pending' | 'in-progress' | 'complete' | 'failed';

export interface College {
  collegeId: string;
  name: string;
  location?: string;
  state?: string;
  programType?: ProgramType;
  isDirectAdmit?: boolean;
  isTopPick?: boolean;
  ranking?: string;
  overview?: string;
  admissionsDeepDive?: string;
  employmentRate?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  costOfAttendanceOutOfState?: number;
  estimatedNetPriceAfterAid?: number;
  percentReceivingAid?: string;
  avgAidAmount?: number;
  applicationFee?: number;
  estimatedTotalCost?: number;
  estimatedCostAfterAid?: number;
  acceptanceRateProgram?: string;
  acceptanceRateUniversity?: string;
  avgGPAAdmitted?: string;
  prerequisites?: string[];
  programDetails?: { label: string; value: string }[];
  applicationDeadlines?: { earlyAction?: string; regularDecision?: string; programApp?: string };
  essayPrompts?: string[];
  requiredTests?: string[];
  testimonials?: { quote: string; attribution?: string; source?: string }[];
  campusImageUrls?: string[];
  specialNotes?: string;
  website?: string;
  dataSources?: string[];
  /** Readable titles for some `dataSources` (resolved during hydration); the rest fall back to URL parsing. */
  dataSourceTitles?: { url: string; title: string }[];
  dataAsOf?: string;
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; mascot?: string };
  contactInfo?: {
    programAdmissionsPhone?: string;
    programAdmissionsEmail?: string;
    programAdmissionsUrl?: string;
    financialAidPhone?: string;
    financialAidUrl?: string;
    campusVisitUrl?: string;
  };
  status?: CollegeStatus;
  fitScore?: number;
  hydrationStatus?: HydrationStatus;
  lastDataRefresh?: string;
  userEdited?: string[];
  addedBy?: 'ai-discovered' | 'manual';
  // Campus imagery + cached logo, set by the async assets worker (never user-editable).
  campusImageUrl?: string;
  campusImageCredit?: string;
  logoImageUrl?: string;
  assetsStatus?: AssetsStatus;
  /** AI "how to prepare in high school for this college" plan (see POST /colleges/:id/prep). */
  hsPrepPlan?: HsPrepPlan;
  /** Prep-plan generation lifecycle — it runs async on the worker, so the UI polls this until it
   *  settles to 'complete' (use hsPrepPlan) or 'failed'. */
  hsPrepStatus?: 'pending' | 'in-progress' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
}

/** One recommendation in a high-school prep plan: a short label + an optional one-line "why/how". */
export interface HsPrepItem {
  label: string;
  detail?: string;
}

/** AI plan of what to aim for + take in high school to be competitive for a specific college's program. */
export interface HsPrepPlan {
  headline?: string;
  targets: HsPrepItem[];
  courses: HsPrepItem[];
  activities: HsPrepItem[];
}

/** Body for create/update (the lib stamps id + timestamps; imagery is system-owned). */
export type CollegeInput = Partial<
  Omit<
    College,
    | 'collegeId'
    | 'createdAt'
    | 'updatedAt'
    | 'hydrationStatus'
    | 'lastDataRefresh'
    | 'userEdited'
    | 'addedBy'
    | 'campusImageUrl'
    | 'campusImageCredit'
    | 'logoImageUrl'
    | 'assetsStatus'
    | 'hsPrepPlan'
  >
> & {
  name?: string;
};

export interface CollegeCandidate {
  name: string;
  location?: string;
  state?: string;
  programType?: ProgramType;
  isDirectAdmit?: boolean;
  ranking?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  website?: string;
  summary?: string;
}

/** An async discovery job — created by POST /colleges/discover, polled via GET /colleges/discover/:jobId. */
export interface DiscoveryJob {
  jobId: string;
  status: 'pending' | 'complete' | 'failed';
  candidates?: CollegeCandidate[];
  count?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollegeNote {
  collegeId: string;
  noteId: string;
  author: string;
  content: string;
  noteType?: 'general' | 'visit' | 'research' | 'contact' | 'financial-aid' | 'application-update';
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedDate?: string;
  completedBy?: string;
  dueDate?: string;
}

export interface CollegeChecklist {
  collegeId: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverFilters {
  query?: string;
  state?: string;
  programType?: ProgramType;
  maxTuition?: number;
  directAdmitOnly?: boolean;
  limit?: number;
}

export interface ListFilters {
  status?: CollegeStatus;
  programType?: ProgramType;
  state?: string;
  isTopPick?: boolean;
  search?: string;
  sortBy?: 'name' | 'fitScore' | 'status' | 'tuition' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  includeRemoved?: boolean;
}

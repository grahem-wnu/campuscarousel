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
  'direct-admit-BSN',
  'pre-nursing-secondary-app',
  'ABSN-only',
  'RN-to-BSN-only',
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export type HydrationStatus = 'pending' | 'in-progress' | 'complete' | 'partial' | 'failed';

export interface College {
  collegeId: string;
  name: string;
  location?: string;
  state?: string;
  programType?: ProgramType;
  isDirectAdmit?: boolean;
  hasBSN?: boolean;
  hasAcceleratedBSN?: boolean;
  isTopPick?: boolean;
  ranking?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  estimatedTotalCost?: number;
  estimatedCostAfterAid?: number;
  acceptanceRateNursing?: string;
  acceptanceRateUniversity?: string;
  avgGPAAdmitted?: string;
  prerequisites?: string[];
  applicationDeadlines?: { earlyAction?: string; regularDecision?: string; nursingApp?: string };
  essayPrompts?: string[];
  requiredTests?: string[];
  clinicalPartners?: string[];
  specialNotes?: string;
  website?: string;
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; mascot?: string };
  contactInfo?: {
    nursingAdmissionsPhone?: string;
    nursingAdmissionsEmail?: string;
    nursingAdmissionsUrl?: string;
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
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps). */
export type CollegeInput = Partial<Omit<College, 'collegeId' | 'createdAt' | 'updatedAt' | 'hydrationStatus' | 'lastDataRefresh' | 'userEdited' | 'addedBy'>> & {
  name?: string;
};

export interface CollegeCandidate {
  name: string;
  location?: string;
  state?: string;
  programType?: ProgramType;
  isDirectAdmit?: boolean;
  hasBSN?: boolean;
  ranking?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  website?: string;
  summary?: string;
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

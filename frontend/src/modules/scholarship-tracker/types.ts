// Frontend types for the Scholarship Tracker. Mirror the API responses (the backend's data shapes);
// the frontend has no access to the backend data-layer package, so the contract is restated here and
// kept in sync via the API. Scholarships are family-visible — there is no `visibility` field.

export const TYPES = [
  'merit',
  'need-based',
  'nursing-specific',
  'community-service',
  'diversity',
  'state-specific',
  'organization',
  'other',
] as const;
export type ScholarshipType = (typeof TYPES)[number];

export const STATUSES = [
  'discovered',
  'researching',
  'preparing',
  'applied',
  'awarded',
  'denied',
  'expired',
] as const;
export type Status = (typeof STATUSES)[number];

export type HydrationStatus = 'pending' | 'in-progress' | 'complete' | 'partial' | 'failed';

export interface Scholarship {
  scholarshipId: string;
  name: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  type?: ScholarshipType;
  eligibility?: string[];
  applicationDeadline?: string;
  applicationUrl?: string;
  requiredMaterials?: string[];
  linkedColleges?: string[];
  isRenewable?: boolean;
  renewalRequirements?: string;
  status?: Status;
  awardedAmount?: number;
  notes?: string;
  addedBy?: 'ai-discovered' | 'manual';
  hydrationStatus?: HydrationStatus;
  lastDataRefresh?: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps; the server records addedBy). */
export interface ScholarshipInput {
  name: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  type?: ScholarshipType;
  eligibility?: string[];
  applicationDeadline?: string;
  applicationUrl?: string;
  requiredMaterials?: string[];
  linkedColleges?: string[];
  isRenewable?: boolean;
  renewalRequirements?: string;
  status?: Status;
  awardedAmount?: number;
  notes?: string;
}

/** An AI-discovered candidate (strict subset; drops into bulk-add). */
export interface DiscoveredScholarship {
  name: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  type?: ScholarshipType;
  eligibility?: string[];
  applicationDeadline?: string;
  applicationUrl?: string;
}

export interface ScholarshipSummary {
  totalTracked: number;
  countsByStatus: Record<string, number>;
  totalPotential: number;
  totalAwarded: number;
  budget: { totalBudget: number | null; adjustedRemaining: number | null };
}

export interface ListFilters {
  type?: ScholarshipType;
  status?: Status;
  linkedCollege?: string;
  deadlineBefore?: string;
}

export interface DiscoverInput {
  query?: string;
  type?: ScholarshipType;
  state?: string;
  linkedColleges?: string[];
  count?: number;
}

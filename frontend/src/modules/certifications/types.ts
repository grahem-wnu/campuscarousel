// Frontend types for Certifications. These mirror the API responses (the backend data shapes) —
// the frontend has no access to the backend data-layer package, so the contract is restated here
// and kept in sync via the API.

export const CERT_STATUSES = [
  'planned',
  'in-progress',
  'active',
  'expiring-soon',
  'expired',
  'renewed',
] as const;

export type CertStatus = (typeof CERT_STATUSES)[number];

export interface Certification {
  certId: string;
  name: string;
  issuingOrganization?: string;
  certificationNumber?: string;
  dateEarned?: string;
  expirationDate?: string | null;
  renewalRequired?: boolean;
  renewalFrequency?: string;
  renewalRequirements?: string;
  status?: CertStatus;
  trainingProgram?: string;
  trainingHours?: number;
  cost?: number;
  documentUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Server-computed display fields (see backend status.ts decorate()). */
  effectiveStatus: CertStatus;
  daysUntilExpiration: number | null;
}

/** Body for create/update (the lib stamps id + timestamps). */
export interface CertificationInput {
  name: string;
  issuingOrganization?: string;
  certificationNumber?: string;
  dateEarned?: string;
  expirationDate?: string | null;
  renewalRequired?: boolean;
  renewalFrequency?: string;
  renewalRequirements?: string;
  status?: CertStatus;
  trainingProgram?: string;
  trainingHours?: number;
  cost?: number;
  documentUrl?: string;
  notes?: string;
}

export interface CertSuggestion {
  name: string;
  issuingOrganization?: string;
  why: string;
  typicalCost?: number;
  renewalFrequency?: string;
  priority: number;
}

export interface SuggestResponse {
  careerGoal: string;
  suggestions: CertSuggestion[];
}

export interface ListFilters {
  status?: CertStatus;
}

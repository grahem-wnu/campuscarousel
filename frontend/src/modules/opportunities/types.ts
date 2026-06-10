// Opportunity Finder types (v2.1 Module 18) — mirrors the backend Opportunity shape.

export type OpportunityType =
  | 'hospital-volunteer'
  | 'shadowing'
  | 'cna-program'
  | 'summer-program'
  | 'job'
  | 'club'
  | 'other';

export type OpportunityStatus =
  | 'discovered'
  | 'interested'
  | 'applied'
  | 'active'
  | 'completed'
  | 'dismissed';

export interface Opportunity {
  opportunityId: string;
  name: string;
  organization?: string;
  type: OpportunityType;
  location?: string;
  distanceNote?: string;
  description?: string;
  eligibility?: string[];
  timeCommitment?: string;
  cost?: number;
  applicationUrl?: string;
  contact?: { name?: string; email?: string; phone?: string };
  applicationDeadline?: string;
  status: OpportunityStatus;
  addedBy?: 'ai-discovered' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityCandidate {
  name: string;
  organization?: string;
  type?: OpportunityType;
  location?: string;
  distanceNote?: string;
  description?: string;
  eligibility?: string[];
  timeCommitment?: string;
  cost?: number;
  applicationUrl?: string;
  applicationDeadline?: string;
}

export interface DiscoveryJob {
  jobId: string;
  status: 'pending' | 'complete' | 'failed';
  candidates?: OpportunityCandidate[];
  count?: number;
  error?: string;
}

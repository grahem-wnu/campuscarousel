// Financial Aid Center types (v2.1 Module 19) — mirrors the backend FinAidItem shape.

export type FinAidKind =
  | 'fafsa'
  | 'css-profile'
  | 'state-aid'
  | 'institutional-aid'
  | 'loan'
  | 'award-letter'
  | 'other';

export type FinAidStatus = 'not-started' | 'in-progress' | 'submitted' | 'received' | 'n/a';

export interface FinAidItem {
  itemId: string;
  kind: FinAidKind;
  title: string;
  relatedCollegeId?: string;
  openDate?: string;
  deadline?: string;
  priorityDeadline?: string;
  status: FinAidStatus;
  amountOffered?: number;
  amountAccepted?: number;
  documentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinAidSummary {
  total: number;
  byStatus: Record<string, number>;
  nearestDeadline: { title: string; deadline: string } | null;
}

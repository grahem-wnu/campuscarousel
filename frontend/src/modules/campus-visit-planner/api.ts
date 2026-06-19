// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.
//
// `listColleges` calls the College Hub's GET /colleges endpoint via the shared client (a stable
// merged contract) to populate the college picker — this module reads colleges, it does not own them.

import { api } from '../../shared/api';
import type { CollegeOption, Visit, VisitInput, VisitPrep } from './types';

export async function listColleges(): Promise<CollegeOption[]> {
  const res = await api.get<{ colleges: CollegeOption[] }>('/colleges');
  return res.colleges;
}

export async function listVisits(collegeId: string): Promise<Visit[]> {
  const res = await api.get<{ visits: Visit[] }>(`/colleges/${encodeURIComponent(collegeId)}/visits`);
  return res.visits;
}

export function createVisit(collegeId: string, input: VisitInput): Promise<Visit> {
  return api.post<Visit>(`/colleges/${encodeURIComponent(collegeId)}/visits`, input);
}

export function updateVisit(collegeId: string, visitId: string, patch: Partial<VisitInput>): Promise<Visit> {
  return api.put<Visit>(`/colleges/${encodeURIComponent(collegeId)}/visits/${encodeURIComponent(visitId)}`, patch);
}

export function deleteVisit(collegeId: string, visitId: string): Promise<void> {
  return api.del<void>(`/colleges/${encodeURIComponent(collegeId)}/visits/${encodeURIComponent(visitId)}`);
}

export function getPrep(collegeId: string, visitId: string): Promise<VisitPrep> {
  return api.post<VisitPrep>(
    `/colleges/${encodeURIComponent(collegeId)}/visits/${encodeURIComponent(visitId)}/prep`,
    {},
  );
}

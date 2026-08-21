// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.
//
// Both AI endpoints return 202 and do their work on the worker, so the two `start*` calls are
// fire-and-poll: kick off, then re-read with `listScholarships` / `getScholarship` until the status
// settles.

import { api } from '../../shared/api';
import type { CollegeScholarship, ScholarshipsResponse, SearchCategory } from './types';

const enc = encodeURIComponent;

/** Everything the tab needs in one read: the search lifecycle plus every award found so far. */
export function listScholarships(collegeId: string): Promise<ScholarshipsResponse> {
  return api.get<ScholarshipsResponse>(`/colleges/${enc(collegeId)}/scholarships`);
}

/** Start a web-grounded sweep for this school's awards. Returns the state right after starting —
 *  normally `in-progress`; already settled when the backend ran the job inline (tests/local). */
export function startSearch(
  collegeId: string,
  input: { category?: SearchCategory; sport?: string } = {},
): Promise<ScholarshipsResponse> {
  const body: { category?: SearchCategory; sport?: string } = {};
  if (input.category) body.category = input.category;
  // Only send a sport when it is meaningful — an empty string would fail validation.
  if (input.sport?.trim()) body.sport = input.sport.trim();
  return api.post<ScholarshipsResponse>(`/colleges/${enc(collegeId)}/scholarships/search`, body);
}

/** Re-read one award — what the research poll calls. */
export function getScholarship(collegeId: string, scholarshipId: string): Promise<CollegeScholarship> {
  return api.get<CollegeScholarship>(`/colleges/${enc(collegeId)}/scholarships/${enc(scholarshipId)}`);
}

/** Start the deep-research dossier for one award. */
export function startResearch(collegeId: string, scholarshipId: string): Promise<CollegeScholarship> {
  return api.post<CollegeScholarship>(`/colleges/${enc(collegeId)}/scholarships/${enc(scholarshipId)}/research`, {});
}

/** Remove an award the family doesn't care about. */
export function deleteScholarship(collegeId: string, scholarshipId: string): Promise<CollegeScholarship> {
  return api.del<CollegeScholarship>(`/colleges/${enc(collegeId)}/scholarships/${enc(scholarshipId)}`);
}

/** Hand a researched award off to Scholarship Tracker so its deadline joins the family's pipeline.
 *  Deliberately posts to the EXISTING tracker endpoint — this module owns no tracked-scholarship
 *  state of its own. */
export function trackScholarship(
  scholarship: CollegeScholarship,
  collegeName: string,
): Promise<{ scholarshipId: string }> {
  const body: Record<string, unknown> = {
    name: scholarship.name,
    status: 'researching',
    linkedColleges: [collegeName],
  };
  if (scholarship.provider) body.provider = scholarship.provider;
  if (typeof scholarship.amount === 'number') body.amount = scholarship.amount;
  if (scholarship.amountDescription) body.amountDescription = scholarship.amountDescription;
  if (scholarship.deadline) body.applicationDeadline = scholarship.deadline;
  const url = scholarship.research?.applicationUrl ?? scholarship.url;
  if (url) body.applicationUrl = url;
  if (scholarship.eligibility?.length) body.eligibility = scholarship.eligibility.slice(0, 100);
  if (scholarship.research?.requiredMaterials?.length) {
    body.requiredMaterials = scholarship.research.requiredMaterials.slice(0, 100);
  }
  if (typeof scholarship.renewable === 'boolean') body.isRenewable = scholarship.renewable;
  return api.post<{ scholarshipId: string }>('/scholarships', body);
}

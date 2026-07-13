// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type {
  AdmissionBucket,
  College,
  CollegeChecklist,
  CollegeInput,
  CollegeNote,
  ChecklistItem,
  DiscoverFilters,
  DiscoveryJob,
  HsPrepPlan,
  ListFilters,
} from './types';

function listQuery(f: ListFilters): Record<string, string | number | boolean | undefined> {
  return {
    status: f.status,
    programType: f.programType,
    state: f.state,
    isTopPick: f.isTopPick === undefined ? undefined : String(f.isTopPick),
    search: f.search,
    sortBy: f.sortBy,
    sortOrder: f.sortOrder,
    includeRemoved: f.includeRemoved ? 'true' : undefined,
  };
}

export async function listColleges(filters: ListFilters = {}): Promise<College[]> {
  const res = await api.get<{ colleges: College[] }>('/colleges', { query: listQuery(filters) });
  return res.colleges;
}

export function getCollege(id: string): Promise<College> {
  return api.get<College>(`/colleges/${encodeURIComponent(id)}`);
}

export function createCollege(input: CollegeInput): Promise<College> {
  return api.post<College>('/colleges', input);
}

export function updateCollege(id: string, patch: CollegeInput): Promise<College> {
  return api.put<College>(`/colleges/${encodeURIComponent(id)}`, patch);
}

export function deleteCollege(id: string): Promise<College> {
  return api.del<College>(`/colleges/${encodeURIComponent(id)}`);
}

export function setTopPick(id: string, isTopPick: boolean): Promise<College> {
  return api.patch<College>(`/colleges/${encodeURIComponent(id)}/top-pick`, { isTopPick });
}

/** Set (or clear, with `null`) the family's admissions-bucket override. `null` reverts to the AI
 *  suggestion. Returns the updated college. Mirrors the top-pick call. */
export const setBucket = (id: string, bucket: AdmissionBucket | null): Promise<College> =>
  api.patch<College>(`/colleges/${encodeURIComponent(id)}/bucket`, { bucket });

export function hydrateCollege(id: string): Promise<College> {
  return api.post<College>(`/colleges/${encodeURIComponent(id)}/hydrate`);
}

export function hydrateAll(): Promise<{ requested: number }> {
  return api.post<{ requested: number }>('/colleges/hydrate-all');
}

/** Start an async discovery job. Web-grounded discovery runs on the SQS worker (it can exceed the
 *  30s API budget), so this returns a job to poll via getDiscovery — it does NOT block on results. */
export function startDiscovery(filters: DiscoverFilters): Promise<DiscoveryJob> {
  return api.post<DiscoveryJob>('/colleges/discover', filters);
}

/** Poll a discovery job's status + candidates. */
export function getDiscovery(jobId: string): Promise<DiscoveryJob> {
  return api.get<DiscoveryJob>(`/colleges/discover/${encodeURIComponent(jobId)}`);
}

/** One-time: fetch campus imagery + logos for existing colleges that have no campus photo yet. */
export function backfillAssets(): Promise<{ requested: number }> {
  return api.post<{ requested: number }>('/colleges/assets-backfill');
}

export function bulkAddColleges(colleges: CollegeInput[]): Promise<{ created: College[]; skipped: string[] }> {
  return api.post<{ created: College[]; skipped: string[] }>('/colleges/bulk-add', { colleges });
}

export async function listNotes(id: string): Promise<CollegeNote[]> {
  const res = await api.get<{ notes: CollegeNote[] }>(`/colleges/${encodeURIComponent(id)}/notes`);
  return res.notes;
}

export function addNote(id: string, content: string, noteType?: CollegeNote['noteType']): Promise<CollegeNote> {
  return api.post<CollegeNote>(`/colleges/${encodeURIComponent(id)}/notes`, { content, noteType });
}

export async function getChecklist(id: string): Promise<ChecklistItem[]> {
  const res = await api.get<CollegeChecklist>(`/colleges/${encodeURIComponent(id)}/checklist`);
  return res.items ?? [];
}

export function putChecklist(id: string, items: ChecklistItem[]): Promise<CollegeChecklist> {
  return api.put<CollegeChecklist>(`/colleges/${encodeURIComponent(id)}/checklist`, { items });
}

/** AI-suggested application steps for this college, tailored to the student's major. Returns an
 *  editable list (label + optional ISO dueDate); the caller merges + persists via putChecklist. */
export async function suggestChecklist(id: string): Promise<{ label: string; dueDate?: string }[]> {
  const res = await api.post<{ suggestions: { label: string; dueDate?: string }[] }>(
    `/colleges/${encodeURIComponent(id)}/checklist/suggest`,
    {},
  );
  return res.suggestions ?? [];
}

/** Kick off the AI "how to prepare in high school" plan for this college (tailored to the student's
 *  major + grad year). Generation runs async on the worker, so this returns 202 with the current
 *  status ('in-progress' in prod; 'complete' + plan when the backend ran it inline). Poll
 *  getCollege() until hsPrepStatus settles to 'complete' (use hsPrepPlan) or 'failed'. */
export async function generatePrep(
  id: string,
): Promise<{ status: 'pending' | 'in-progress' | 'complete' | 'failed'; plan: HsPrepPlan | null }> {
  return api.post(`/colleges/${encodeURIComponent(id)}/prep`, {});
}

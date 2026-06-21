// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type {
  CertGuidanceJob,
  Certification,
  CertificationInput,
  ListFilters,
  SuggestResponse,
} from './types';

export async function listCertifications(filters: ListFilters = {}): Promise<Certification[]> {
  const res = await api.get<{ certifications: Certification[] }>('/certifications', {
    query: { status: filters.status },
  });
  return res.certifications;
}

export async function listExpiring(days?: number): Promise<Certification[]> {
  const res = await api.get<{ certifications: Certification[]; days: number }>(
    '/certifications/expiring',
    { query: { days } },
  );
  return res.certifications;
}

export function getCertification(id: string): Promise<Certification> {
  return api.get<Certification>(`/certifications/${encodeURIComponent(id)}`);
}

export function createCertification(input: CertificationInput): Promise<Certification> {
  return api.post<Certification>('/certifications', input);
}

export function updateCertification(
  id: string,
  patch: Partial<CertificationInput>,
): Promise<Certification> {
  return api.put<Certification>(`/certifications/${encodeURIComponent(id)}`, patch);
}

export function deleteCertification(id: string): Promise<void> {
  return api.del<void>(`/certifications/${encodeURIComponent(id)}`);
}

export function suggestCertifications(careerGoal?: string): Promise<SuggestResponse> {
  return api.post<SuggestResponse>('/certifications/suggest', careerGoal ? { careerGoal } : {});
}

/** Start an async "how & where to get this cert near me" research job (web-grounded, runs on the
 *  worker). Poll `getCertGuidance` with the returned jobId until it settles, then render the result. */
export function startCertGuidance(certName: string): Promise<CertGuidanceJob> {
  return api.post<CertGuidanceJob>('/certifications/guidance', { certName });
}

/** Poll a guidance job's status + result. */
export function getCertGuidance(jobId: string): Promise<CertGuidanceJob> {
  return api.get<CertGuidanceJob>(`/certifications/guidance/${encodeURIComponent(jobId)}`);
}

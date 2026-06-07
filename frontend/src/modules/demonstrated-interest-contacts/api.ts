// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch. `listColleges`
// consumes college-hub's public GET /colleges (for the touchpoint college picker + names).

import { api } from '../../shared/api';
import type {
  CollegeRef,
  Contact,
  ContactInput,
  FollowUp,
  RecommendersResponse,
  Touchpoint,
  TouchpointInput,
} from './types';

const enc = encodeURIComponent;

// — Touchpoints (per college) —
export async function listTouchpoints(collegeId: string): Promise<Touchpoint[]> {
  const res = await api.get<{ touchpoints: Touchpoint[] }>(`/colleges/${enc(collegeId)}/touchpoints`);
  return res.touchpoints;
}
export function createTouchpoint(collegeId: string, input: TouchpointInput): Promise<Touchpoint> {
  return api.post<Touchpoint>(`/colleges/${enc(collegeId)}/touchpoints`, input);
}
export function updateTouchpoint(collegeId: string, tid: string, patch: Partial<TouchpointInput>): Promise<Touchpoint> {
  return api.put<Touchpoint>(`/colleges/${enc(collegeId)}/touchpoints/${enc(tid)}`, patch);
}
export function deleteTouchpoint(collegeId: string, tid: string): Promise<void> {
  return api.del<void>(`/colleges/${enc(collegeId)}/touchpoints/${enc(tid)}`);
}
export async function listFollowUps(): Promise<FollowUp[]> {
  const res = await api.get<{ followUps: FollowUp[] }>('/touchpoints/follow-ups');
  return res.followUps;
}

// — Contacts —
export async function listContacts(): Promise<Contact[]> {
  const res = await api.get<{ contacts: Contact[] }>('/contacts');
  return res.contacts;
}
export function getContact(id: string): Promise<Contact> {
  return api.get<Contact>(`/contacts/${enc(id)}`);
}
export function createContact(input: ContactInput): Promise<Contact> {
  return api.post<Contact>('/contacts', input);
}
export function updateContact(id: string, patch: Partial<ContactInput>): Promise<Contact> {
  return api.put<Contact>(`/contacts/${enc(id)}`, patch);
}
export function deleteContact(id: string): Promise<void> {
  return api.del<void>(`/contacts/${enc(id)}`);
}
export function listRecommenders(): Promise<RecommendersResponse> {
  return api.get<RecommendersResponse>('/contacts/recommenders');
}
export async function recommenderBrief(id: string, focus?: string): Promise<string> {
  const res = await api.post<{ contactId: string; brief: string }>(`/contacts/${enc(id)}/recommender-brief`, { focus });
  return res.brief;
}

// — Colleges (consumed from college-hub for the touchpoint picker) —
export async function listColleges(): Promise<CollegeRef[]> {
  const res = await api.get<{ colleges: CollegeRef[] }>('/colleges');
  return res.colleges.map((c) => ({ collegeId: c.collegeId, name: c.name }));
}

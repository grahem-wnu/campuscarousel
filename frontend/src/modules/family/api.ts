import { api } from "../../shared/api";
import type { Student } from "../../shared/shell";

export interface StudentInput {
  name: string;
  graduationYear?: number;
}

export function createStudent(input: StudentInput): Promise<Student> {
  return api.post<Student>("/students", input);
}

export function updateStudent(
  studentId: string,
  patch: Partial<StudentInput> & { status?: "active" | "archived" },
): Promise<Student> {
  return api.patch<Student>(`/students/${studentId}`, patch);
}

export function deleteStudent(studentId: string): Promise<void> {
  return api.del<void>(`/students/${studentId}`);
}

// --- Family members (the wider circle: guardians, grandparents, counselors, friends, …) ----------

export type MemberRelationship =
  | "parent"
  | "grandparent"
  | "aunt-uncle"
  | "sibling"
  | "family-friend"
  | "counselor"
  | "mentor"
  | "child"
  | "other";

export type MemberAccessLevel = "manager" | "viewer";

export interface FamilyMember {
  userId: string;
  /** The invitee's email. Optional — code-invited members (esp. students) have no email. */
  email?: string;
  displayName?: string;
  relationship: MemberRelationship;
  accessLevel: MemberAccessLevel;
  status: "invited" | "active";
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export function listMembers(): Promise<{ members: FamilyMember[] }> {
  return api.get<{ members: FamilyMember[] }>("/family/members");
}

// --- Shareable-code invites (co-parent / viewer / student login) ---------------------------------
// A manager mints a single-use code; the invitee redeems it on the public /join-family page, choosing
// their own login name + password. No email is sent — the manager shares the link/code directly.

export type FamilyInviteKind = "coparent" | "viewer" | "student";

export interface CreateInviteInput {
  kind: FamilyInviteKind;
  /** Descriptive relationship (co-parent/viewer invites). */
  relationship?: MemberRelationship;
  /** The roster child this login is for (kind === "student"). */
  studentId?: string;
  displayName?: string;
}

/** What the create endpoint returns: the raw code plus a ready-to-share join link. */
export interface InviteResult {
  code: string;
  url: string;
}

/** A still-pending invite, as listed for the family. */
export interface PendingInvite {
  code: string;
  kind: FamilyInviteKind;
  relationship?: MemberRelationship;
  studentId?: string;
  displayName?: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export function createInvite(input: CreateInviteInput): Promise<InviteResult> {
  return api.post<InviteResult>("/family/invites", input);
}

export function listInvites(): Promise<{ invites: PendingInvite[] }> {
  return api.get<{ invites: PendingInvite[] }>("/family/invites");
}

export function revokeInvite(code: string): Promise<void> {
  return api.post<void>(`/family/invites/${encodeURIComponent(code)}/revoke`, {});
}

export function updateMember(
  userId: string,
  patch: Partial<Pick<FamilyMember, "displayName" | "relationship" | "accessLevel">>,
): Promise<FamilyMember> {
  return api.patch<FamilyMember>(`/family/members/${encodeURIComponent(userId)}`, patch);
}

export function deleteMember(userId: string): Promise<void> {
  return api.del<void>(`/family/members/${encodeURIComponent(userId)}`);
}

// --- Active student's academic profile (intended majors) -----------------------------------------
// /profile is scoped to the active student (X-Student-Id), so this reads/writes the CURRENT child.

export interface StudentAcademicProfile {
  name?: string;
  intendedMajors?: string[];
  careerGoal?: string;
}

export function getStudentProfile(): Promise<StudentAcademicProfile> {
  return api.get<StudentAcademicProfile>("/profile");
}

export function putStudentProfile(patch: Partial<StudentAcademicProfile>): Promise<StudentAcademicProfile> {
  return api.put<StudentAcademicProfile>("/profile", patch);
}

export const RELATIONSHIP_LABELS: Record<MemberRelationship, string> = {
  parent: "Parent / Guardian",
  grandparent: "Grandparent",
  "aunt-uncle": "Aunt / Uncle",
  sibling: "Sibling",
  "family-friend": "Family friend",
  counselor: "Counselor",
  mentor: "Mentor",
  child: "Child / Student",
  other: "Other",
};

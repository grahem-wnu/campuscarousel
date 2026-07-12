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
  | "other";

export type MemberAccessLevel = "manager" | "viewer";

export interface FamilyMember {
  userId: string;
  email: string;
  displayName?: string;
  relationship: MemberRelationship;
  accessLevel: MemberAccessLevel;
  status: "invited" | "active";
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Only on the invite response: whether the credential email was sent (false in SES sandbox / on
   *  mail failure — the account is still created). */
  emailed?: boolean;
}

export interface InviteMemberInput {
  email: string;
  displayName?: string;
  relationship: MemberRelationship;
  accessLevel: MemberAccessLevel;
}

export function listMembers(): Promise<{ members: FamilyMember[] }> {
  return api.get<{ members: FamilyMember[] }>("/family/members");
}

export function inviteMember(input: InviteMemberInput): Promise<FamilyMember> {
  return api.post<FamilyMember>("/family/members", input);
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
  other: "Other",
};

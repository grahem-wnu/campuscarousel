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

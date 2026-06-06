// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { Course, CourseInput, GpaResult, ListFilters, PrereqReport } from './types';

export async function listCourses(filters: ListFilters = {}): Promise<Course[]> {
  const res = await api.get<{ courses: Course[] }>('/courses', {
    query: { year: filters.year, subject: filters.subject },
  });
  return res.courses;
}

export function createCourse(input: CourseInput): Promise<Course> {
  return api.post<Course>('/courses', input);
}

export function updateCourse(id: string, patch: Partial<CourseInput>): Promise<Course> {
  return api.put<Course>(`/courses/${encodeURIComponent(id)}`, patch);
}

export function deleteCourse(id: string): Promise<void> {
  return api.del<void>(`/courses/${encodeURIComponent(id)}`);
}

export function getGpa(): Promise<GpaResult> {
  return api.get<GpaResult>('/courses/gpa');
}

export function getPrerequisites(collegeId: string): Promise<PrereqReport> {
  return api.get<PrereqReport>(`/courses/prerequisites/${encodeURIComponent(collegeId)}`);
}

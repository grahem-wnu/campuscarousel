import { api } from '../../shared/api';

export interface StudentActivity {
  name: string;
  type?: string;
  organization?: string;
}

export interface StudentProfile {
  name?: string;
  highSchool?: string;
  district?: string;
  location?: string;
  graduationYear?: number;
  currentGPA?: number;
  gpaType?: 'weighted' | 'unweighted';
  careerGoal?: string;
  dreamSchool?: string;
  interests?: string[];
  currentActivities?: StudentActivity[];
  budget?: { total?: number; currency?: 'USD'; notes?: string };
  onboardingComplete?: boolean;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function getProfile(): Promise<StudentProfile> {
  return api.get<StudentProfile>('/profile');
}

export function putProfile(patch: Partial<StudentProfile>): Promise<StudentProfile> {
  return api.put<StudentProfile>('/profile', patch);
}

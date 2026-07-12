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
  /** Intended college major(s) — a student may be weighing more than one. Drives AI + genericizes
   *  the app away from a hardcoded nursing focus. */
  intendedMajors?: string[];
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

// --- Conversational onboarding ------------------------------------------------------------------

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

/** What the chat has gathered so far. `budgetTotal` is flattened for the chat; finish maps it back. */
export interface OnboardingProfile {
  name?: string;
  graduationYear?: number;
  currentGPA?: number;
  gpaType?: 'weighted' | 'unweighted';
  careerGoal?: string;
  intendedMajors?: string[];
  location?: string;
  highSchool?: string;
  interests?: string[];
  /** Colleges the family explicitly named — reviewed on the confirm step and guaranteed to seed. */
  collegesOfInterest?: string[];
  budgetTotal?: number;
}

export interface OnboardingTurn {
  reply: string;
  profile: OnboardingProfile;
  done: boolean;
  /** How many students the family said they're setting up (present once the chat asks + they answer).
   *  Sizes the multi-child onboarding loop. */
  studentCount?: number;
}

/** One conversational turn: send the full (short) transcript, get the guide's next message + the
 *  cumulative profile + whether it's ready to finish. */
export function onboardingChat(messages: ChatMsg[]): Promise<OnboardingTurn> {
  return api.post<OnboardingTurn>('/onboarding/chat', { messages });
}

export interface FinishResult {
  profile: StudentProfile;
  /** Seeding (starter goals + colleges + budget) runs in the background; this is its status. */
  seeding?: string;
}

/** Save the gathered profile (marks onboarding complete). Seeding is enqueued server-side and fills in
 *  on the dashboard shortly after — finish returns fast (202) so the family isn't held on a spinner. */
export function finishOnboarding(profile: OnboardingProfile): Promise<FinishResult> {
  return api.post<FinishResult>('/onboarding/finish', { profile });
}

/** TESTING (admin): reset the active student's SETUP (major, AI goals, discovered colleges) and re-run
 *  onboarding — factual data (GPA, courses, journal) is kept. */
export function resetStudent(): Promise<{ ok: boolean; goalsRemoved: number; collegesRemoved: number }> {
  return api.post<{ ok: boolean; goalsRemoved: number; collegesRemoved: number }>('/onboarding/reset', {});
}

// --- Family-level setup state (FTUE loop progress) ----------------------------------------------

/** Family-level FTUE progress: how many kids the family said they'd set up, and whether the loop
 *  finished. Drives the resume nudge. `{}` before anything is saved. */
export interface SetupState {
  declaredStudentCount?: number;
  setupComplete?: boolean;
}

export function getSetup(): Promise<SetupState> {
  return api.get<SetupState>('/setup');
}

export function putSetup(patch: SetupState): Promise<SetupState> {
  return api.put<SetupState>('/setup', patch);
}

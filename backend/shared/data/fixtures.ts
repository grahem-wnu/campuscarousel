// Test fixtures: builders with sensible defaults + a `seed` helper that populates a small,
// realistic dataset. Module workers import these in their integration/privacy tests so they
// don't hand-roll entity shapes. Pure helpers — no AWS, safe to use with InMemoryTableClient.

import type { Data } from './index.js';
import type { Activity, ExperienceEntry, College, Scholarship, Motivation } from './types.js';

type NewActivity = Omit<Activity, 'activityId' | 'createdAt' | 'updatedAt'>;
type NewExperience = Omit<ExperienceEntry, 'entryId' | 'createdAt' | 'updatedAt'>;
type NewMotivation = Omit<Motivation, 'entryId' | 'createdAt' | 'updatedAt'>;
type NewCollege = Omit<College, 'collegeId' | 'createdAt' | 'updatedAt'>;
type NewScholarship = Omit<Scholarship, 'scholarshipId' | 'createdAt' | 'updatedAt'>;

export const buildActivity = (over: Partial<NewActivity> = {}): NewActivity => ({
  userId: 'keira',
  date: '2026-01-15',
  category: 'volunteer',
  title: 'Hospital volunteering',
  hours: 3,
  visibility: 'family',
  ...over,
});

export const buildExperience = (over: Partial<NewExperience> = {}): NewExperience => ({
  date: '2026-02-01',
  facility: 'CHOC Children’s Hospital',
  department: 'Pediatric ICU',
  hours: 4,
  visibility: 'family',
  ...over,
});

export const buildMotivation = (over: Partial<NewMotivation> = {}): NewMotivation => ({
  date: '2026-03-01',
  title: 'The conversation at the soup kitchen',
  content: 'A moment that crystallised why this path.',
  visibility: 'family',
  ...over,
});

export const buildCollege = (over: Partial<NewCollege> = {}): NewCollege => ({
  name: 'University of Iowa',
  state: 'IA',
  status: 'target',
  addedBy: 'manual',
  hydrationStatus: 'pending',
  ...over,
});

export const buildScholarship = (over: Partial<NewScholarship> = {}): NewScholarship => ({
  name: 'Future Nurses of America Scholarship',
  amount: 5000,
  type: 'major-specific',
  status: 'discovered',
  addedBy: 'ai-discovered',
  ...over,
});

export interface SeededIds {
  familyActivityId: string;
  privateActivityId: string;
  collegeId: string;
  scholarshipId: string;
  experienceId: string;
}

/**
 * Seed a small dataset including one family-visible and one PRIVATE activity, so privacy
 * tests have data to assert against. Returns the created ids.
 */
export async function seed(data: Data): Promise<SeededIds> {
  const familyActivity = await data.activities.create(
    buildActivity({ title: 'Soccer team captain', category: 'athletic', visibility: 'family' }),
  );
  const privateActivity = await data.activities.create(
    buildActivity({ title: 'Private reflection', visibility: 'private' }),
  );
  const college = await data.colleges.create(buildCollege());
  const scholarship = await data.scholarships.create(buildScholarship());
  const experience = await data.experiences.create(buildExperience());
  return {
    familyActivityId: familyActivity.activityId,
    privateActivityId: privateActivity.activityId,
    collegeId: college.collegeId,
    scholarshipId: scholarship.scholarshipId,
    experienceId: experience.entryId,
  };
}

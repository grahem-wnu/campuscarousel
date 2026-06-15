// Public entry point for the single-table data-access library.
//
//   import { dataFromEnv } from '../../shared/data';   // in a Lambda (reads TABLE_NAME)
//   const data = dataFromEnv();
//   const a = await data.activities.create({ ... });
//
//   import { makeData, InMemoryTableClient } from '../../shared/data';  // in a test
//   const data = makeData(new InMemoryTableClient());
//
// One typed accessor per entity. Visibility filtering is intentionally NOT here — it lives in
// the API/auth layer (specs/foundational/auth.md). This lib returns raw items.

import {
  makeBenchmarks,
  makeBenchmarkHistory,
  makeBudget,
  makeCollegeChecklist,
  makeCollegeNotes,
  makeCareerPath,
  makeConversations,
  makeFocusOverview,
  makeInvites,
  makeMembers,
  makeProfiles,
  makeReminderSettings,
  makeSetupState,
  makeStudentProfile,
  makeStudents,
  makeTenants,
  makeTouchpoints,
  makeVisits,
} from './collections.js';
import { dateSortKey } from './keys.js';
import { makeDetailsRepo, type ListRange } from './repo.js';
import {
  DynamoTableClient,
  tableClientFromEnv,
  type TableClient,
} from './table-client.js';
import { studentScoped, tenantScoped } from './tenant-client.js';
import { InMemoryTableClient } from './memory-client.js';
import type {
  Activity,
  Application,
  Certification,
  ExperienceEntry,
  College,
  Contact,
  Course,
  DiscoveryJob,
  Document,
  Essay,
  ExamScore,
  FinAidItem,
  Goal,
  Opportunity,
  OpportunityDiscoveryJob,
  Interview,
  Recommendation,
  Scholarship,
  TestScore,
  Motivation,
} from './types.js';

/**
 * Build the data accessor. Three storage tiers (SaaS multi-student platform):
 *   - `client` — the PER-CHILD client (`studentScoped(tenantScoped(base))` in prod): every per-child
 *     repo (activities, colleges, …) is keyed `T#<tenant>#S#<student>#…`.
 *   - `familyClient` — the FAMILY-LEVEL client (`tenantScoped(base)` in prod): the student roster,
 *     user profiles, and reminder settings are keyed `T#<tenant>#…` (shared across the family's kids).
 *   - `base` — the UN-scoped client for the GLOBAL registries (tenants, invites).
 * Defaults collapse all three to `client` so tests can call `makeData(new InMemoryTableClient())`, and
 * the existing 2-arg `makeData(scoped, raw)` form keeps `base` as the global client.
 */
export function makeData(
  client: TableClient,
  base: TableClient = client,
  familyClient: TableClient = client,
) {
  // Activities — collection by date (GSI1) + by category (GSI2).
  const activitiesBase = makeDetailsRepo<Activity, 'activityId'>(client, {
    prefix: 'ACTIVITY',
    idField: 'activityId',
    collection: 'ACTIVITIES',
    sortField: 'date',
    indexProjections: (a) => ({
      GSI2PK: `CATEGORY#${a.category}`,
      GSI2SK: dateSortKey(a.date, a.activityId),
    }),
  });
  const activities = {
    ...activitiesBase,
    listByCategory: (category: Activity['category'], range?: ListRange): Promise<Activity[]> =>
      activitiesBase.listByIndex('GSI2', `CATEGORY#${category}`, range),
  };

  // Experience hours — collection by date (GSI1) + by facility (GSI3).
  const experiencesBase = makeDetailsRepo<ExperienceEntry, 'entryId'>(client, {
    prefix: 'EXPERIENCE',
    idField: 'entryId',
    collection: 'EXPERIENCES',
    sortField: 'date',
    indexProjections: (c) => ({
      GSI3PK: `FACILITY#${c.facility}`,
      GSI3SK: dateSortKey(c.date, c.entryId),
    }),
  });
  const experiences = {
    ...experiencesBase,
    listByFacility: (facility: string, range?: ListRange): Promise<ExperienceEntry[]> =>
      experiencesBase.listByIndex('GSI3', `FACILITY#${facility}`, range),
  };

  // Exams — dedicated date index (GSI4) per the spec.
  const examsBase = makeDetailsRepo<ExamScore, 'recordId'>(client, {
    prefix: 'EXAM',
    idField: 'recordId',
    sortField: 'date',
    indexProjections: (t) => ({
      GSI4PK: 'EXAM_SCORES',
      GSI4SK: dateSortKey(t.date, t.recordId),
    }),
  });
  const exams = {
    ...examsBase,
    list: (range?: ListRange): Promise<ExamScore[]> => examsBase.listByIndex('GSI4', 'EXAM_SCORES', range),
    listByDateRange: (from: string, to: string, range?: Omit<ListRange, 'from' | 'to'>): Promise<ExamScore[]> =>
      examsBase.listByIndex('GSI4', 'EXAM_SCORES', { ...range, from, to }),
  };

  const colleges = makeDetailsRepo<College, 'collegeId'>(client, {
    prefix: 'COLLEGE',
    idField: 'collegeId',
    collection: 'COLLEGES',
    hydratable: true,
  });

  // Transient async discovery jobs (no collection — fetched only by id while polling).
  const discoveryJobs = makeDetailsRepo<DiscoveryJob, 'jobId'>(client, {
    prefix: 'DISCOVERY',
    idField: 'jobId',
  });

  const scholarships = makeDetailsRepo<Scholarship, 'scholarshipId'>(client, {
    prefix: 'SCHOLARSHIP',
    idField: 'scholarshipId',
    collection: 'SCHOLARSHIPS',
    hydratable: true,
  });

  const goals = makeDetailsRepo<Goal, 'goalId'>(client, {
    prefix: 'GOAL',
    idField: 'goalId',
    collection: 'GOALS',
  });

  // Document metadata (v2.1 F2). Bytes live in the private S3 bucket; this is the index + links.
  const documents = makeDetailsRepo<Document, 'documentId'>(client, {
    prefix: 'DOCUMENT',
    idField: 'documentId',
    collection: 'DOCUMENTS',
  });

  // Opportunity Finder (v2.1 Module 18): tracked volunteer/shadowing/CNA opportunities + async jobs.
  const opportunities = makeDetailsRepo<Opportunity, 'opportunityId'>(client, {
    prefix: 'OPPORTUNITY',
    idField: 'opportunityId',
    collection: 'OPPORTUNITIES',
  });
  const opportunityDiscoveryJobs = makeDetailsRepo<OpportunityDiscoveryJob, 'jobId'>(client, {
    prefix: 'OPPORTUNITY_DISCOVERY',
    idField: 'jobId',
  });

  // Financial Aid Center (v2.1 Module 19): FAFSA/CSS + per-school aid deadlines, sorted by deadline.
  const finaid = makeDetailsRepo<FinAidItem, 'itemId'>(client, {
    prefix: 'FINAID',
    idField: 'itemId',
    collection: 'FINAID',
    sortField: 'deadline', // falls back to createdAt when no deadline set
  });

  const courses = makeDetailsRepo<Course, 'courseId'>(client, {
    prefix: 'COURSE',
    idField: 'courseId',
    collection: 'COURSES',
  });

  const essays = makeDetailsRepo<Essay, 'essayId'>(client, {
    prefix: 'ESSAY',
    idField: 'essayId',
    collection: 'ESSAYS',
  });

  const certifications = makeDetailsRepo<Certification, 'certId'>(client, {
    prefix: 'CERT',
    idField: 'certId',
    collection: 'CERTIFICATIONS',
  });

  const interviews = makeDetailsRepo<Interview, 'sessionId'>(client, {
    prefix: 'INTERVIEW',
    idField: 'sessionId',
    collection: 'INTERVIEWS',
    sortField: 'date',
  });

  const motivations = makeDetailsRepo<Motivation, 'entryId'>(client, {
    prefix: 'MOTIVATION',
    idField: 'entryId',
    collection: 'MOTIVATIONS',
    sortField: 'date',
  });

  const contacts = makeDetailsRepo<Contact, 'contactId'>(client, {
    prefix: 'CONTACT',
    idField: 'contactId',
    collection: 'CONTACTS',
  });

  // Application Central entities (senior-year command center).
  const applications = makeDetailsRepo<Application, 'applicationId'>(client, {
    prefix: 'APPLICATION',
    idField: 'applicationId',
    collection: 'APPLICATIONS',
    sortField: 'deadline', // falls back to createdAt when no deadline set
  });

  const recommendations = makeDetailsRepo<Recommendation, 'recommendationId'>(client, {
    prefix: 'RECOMMENDATION',
    idField: 'recommendationId',
    collection: 'RECOMMENDATIONS',
  });

  const testScores = makeDetailsRepo<TestScore, 'scoreId'>(client, {
    prefix: 'TESTSCORE',
    idField: 'scoreId',
    collection: 'TESTSCORES',
    sortField: 'testDate', // falls back to createdAt when no testDate set
  });

  return {
    activities,
    experiences,
    exams,
    colleges,
    discoveryJobs,
    scholarships,
    goals,
    courses,
    essays,
    certifications,
    interviews,
    motivations,
    contacts,
    applications,
    recommendations,
    testScores,
    // College sub-entities + singletons + conversations.
    collegeNotes: makeCollegeNotes(client),
    touchpoints: makeTouchpoints(client),
    visits: makeVisits(client),
    collegeChecklist: makeCollegeChecklist(client),
    benchmarks: makeBenchmarks(client),
    benchmarkHistory: makeBenchmarkHistory(client),
    conversations: makeConversations(client),
    budget: makeBudget(client),
    documents,
    opportunities,
    opportunityDiscoveryJobs,
    studentProfile: makeStudentProfile(client),
    focusOverview: makeFocusOverview(client),
    careerPath: makeCareerPath(client),
    finaid,
    // FAMILY-LEVEL repos — tenant-scoped but NOT per-child (shared across the family's kids).
    profiles: makeProfiles(familyClient),
    reminderSettings: makeReminderSettings(familyClient),
    setupState: makeSetupState(familyClient),
    students: makeStudents(familyClient),
    members: makeMembers(familyClient),
    // GLOBAL registries — built on the un-scoped base client (never tenant-prefixed).
    tenants: makeTenants(base),
    invites: makeInvites(base),
  };
}

export type Data = ReturnType<typeof makeData>;

/** Build the data client from the environment (CDK injects TABLE_NAME). Use in Lambdas. */
export function dataFromEnv(env: NodeJS.ProcessEnv = process.env): Data {
  // Production three-tier wiring: per-child repos go through studentScoped(tenantScoped(base))
  // (keys `T#<tenant>#S#<student>#…`); family-level repos through tenantScoped(base) (`T#<tenant>#…`);
  // the global registries through the raw base client. All resolved from AsyncLocalStorage, fail-closed.
  const base = tableClientFromEnv(env);
  const family = tenantScoped(base);
  return makeData(studentScoped(family), base, family);
}

export { NotFoundError, isoNow, newId } from './repo.js';
export type { DetailsRepo, ListRange } from './repo.js';
export type { ChildRepo } from './collections.js';
export { DynamoTableClient, tableClientFromEnv, InMemoryTableClient };
export type { TableClient, QueryOptions, StoredItem } from './table-client.js';
export * from './types.js';

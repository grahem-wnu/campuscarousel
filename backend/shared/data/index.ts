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
  makeBudget,
  makeCollegeChecklist,
  makeCollegeNotes,
  makeConversations,
  makeProfiles,
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
import { InMemoryTableClient } from './memory-client.js';
import type {
  Activity,
  Application,
  Certification,
  Clinical,
  College,
  Contact,
  Course,
  DiscoveryJob,
  Document,
  Essay,
  Goal,
  Interview,
  Recommendation,
  Scholarship,
  Teas,
  TestScore,
  WhyNursing,
} from './types.js';

export function makeData(client: TableClient) {
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

  // Clinical hours — collection by date (GSI1) + by facility (GSI3).
  const clinicalBase = makeDetailsRepo<Clinical, 'entryId'>(client, {
    prefix: 'CLINICAL',
    idField: 'entryId',
    collection: 'CLINICAL',
    sortField: 'date',
    indexProjections: (c) => ({
      GSI3PK: `FACILITY#${c.facility}`,
      GSI3SK: dateSortKey(c.date, c.entryId),
    }),
  });
  const clinical = {
    ...clinicalBase,
    listByFacility: (facility: string, range?: ListRange): Promise<Clinical[]> =>
      clinicalBase.listByIndex('GSI3', `FACILITY#${facility}`, range),
  };

  // TEAS — dedicated date index (GSI4) per the spec.
  const teasBase = makeDetailsRepo<Teas, 'recordId'>(client, {
    prefix: 'TEAS',
    idField: 'recordId',
    sortField: 'date',
    indexProjections: (t) => ({
      GSI4PK: 'TEAS_SCORES',
      GSI4SK: dateSortKey(t.date, t.recordId),
    }),
  });
  const teas = {
    ...teasBase,
    list: (range?: ListRange): Promise<Teas[]> => teasBase.listByIndex('GSI4', 'TEAS_SCORES', range),
    listByDateRange: (from: string, to: string, range?: Omit<ListRange, 'from' | 'to'>): Promise<Teas[]> =>
      teasBase.listByIndex('GSI4', 'TEAS_SCORES', { ...range, from, to }),
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

  const whyNursing = makeDetailsRepo<WhyNursing, 'entryId'>(client, {
    prefix: 'WHYNURSING',
    idField: 'entryId',
    collection: 'WHYNURSING',
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
    clinical,
    teas,
    colleges,
    discoveryJobs,
    scholarships,
    goals,
    courses,
    essays,
    certifications,
    interviews,
    whyNursing,
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
    conversations: makeConversations(client),
    budget: makeBudget(client),
    profiles: makeProfiles(client),
    documents,
  };
}

export type Data = ReturnType<typeof makeData>;

/** Build the data client from the environment (CDK injects TABLE_NAME). Use in Lambdas. */
export function dataFromEnv(env: NodeJS.ProcessEnv = process.env): Data {
  return makeData(tableClientFromEnv(env));
}

export { NotFoundError, isoNow, newId } from './repo.js';
export type { DetailsRepo, ListRange } from './repo.js';
export type { ChildRepo } from './collections.js';
export { DynamoTableClient, tableClientFromEnv, InMemoryTableClient };
export type { TableClient, QueryOptions, StoredItem } from './table-client.js';
export * from './types.js';

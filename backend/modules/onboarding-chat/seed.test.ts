import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';
import type { CollegeSeeder } from './ai.js';
import {
  SEED_TYPE,
  makeSeedWorkerHandler,
  makeSqsSeedEnqueuer,
  seedStudent,
  type SeedDeps,
  type SqsSender,
} from './seed.js';

let data: Data;
let hydrated: string[];
let assetsKicked: string[];

const stubSuggester: GoalSuggester = {
  suggest: async () => [
    { title: 'Shadow a nurse', category: 'clinical', milestones: ['Find a mentor', 'Log 10 hours'] },
    { title: 'Start TEAS prep', category: 'test-prep' },
  ],
};
const stubCollegeSeeder: CollegeSeeder = async () => [
  { name: 'State University', state: 'CA' },
  { name: 'Tech Institute' },
];

function deps(over: Partial<SeedDeps> = {}): SeedDeps {
  return {
    getData: () => data,
    suggester: stubSuggester,
    collegeSeeder: stubCollegeSeeder,
    hydrateDispatch: async (id: string) => void hydrated.push(id),
    assetsDispatch: async (id: string) => void assetsKicked.push(id),
    ...over,
  };
}

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  hydrated = [];
  assetsKicked = [];
  await data.studentProfile.put({
    onboardingComplete: true,
    intendedMajors: ['Nursing'],
    careerGoal: 'ICU Nurse',
    location: 'Aliso Viejo, CA',
    budget: { total: 200000, currency: 'USD' },
  } as Parameters<Data['studentProfile']['put']>[0]);
});

describe('seedStudent', () => {
  it('seeds goals, colleges (with hydrate + assets dispatched), and the canonical budget', async () => {
    const res = await seedStudent(deps());
    expect(res).toEqual({ goalsCreated: 2, collegesCreated: 2 });

    const goals = await data.goals.list();
    expect(goals.map((g) => g.title).sort()).toEqual(['Shadow a nurse', 'Start TEAS prep']);

    const colleges = await data.colleges.list();
    expect(colleges.map((c) => c.name).sort()).toEqual(['State University', 'Tech Institute']);
    expect(colleges.every((c) => c.addedBy === 'ai-discovered' && c.hydrationStatus === 'in-progress')).toBe(true);
    expect(hydrated).toHaveLength(2);
    expect(assetsKicked).toHaveLength(2);

    expect((await data.budget.get())?.totalBudget).toBe(200000);
  });

  it("passes the family's named colleges through to the seeder", async () => {
    await data.studentProfile.put({
      onboardingComplete: true,
      intendedMajors: ['Nursing'],
      location: 'Columbus, Ohio',
      collegesOfInterest: ['Cedarville University'],
    } as Parameters<Data['studentProfile']['put']>[0]);
    let receivedMustInclude: string[] | undefined;
    const spySeeder: CollegeSeeder = async (_majors, _location, mustInclude) => {
      receivedMustInclude = mustInclude;
      return (mustInclude ?? []).map((name) => ({ name }));
    };
    await seedStudent(deps({ collegeSeeder: spySeeder }));
    expect(receivedMustInclude).toEqual(['Cedarville University']);
    expect((await data.colleges.list()).map((c) => c.name)).toContain('Cedarville University');
  });

  it('does not duplicate a college that already exists', async () => {
    await data.colleges.create({ name: 'State University', status: 'researching' } as Parameters<Data['colleges']['create']>[0]);
    await seedStudent(deps());
    const names = (await data.colleges.list()).map((c) => c.name.toLowerCase());
    expect(names.filter((n) => n === 'state university')).toHaveLength(1);
  });

  it('is best-effort: returns zero counts (and never throws) when the AI calls fail', async () => {
    const res = await seedStudent(
      deps({
        suggester: { suggest: async () => { throw new Error('suggester down'); } },
        collegeSeeder: async () => { throw new Error('seeder down'); },
      }),
    );
    expect(res).toEqual({ goalsCreated: 0, collegesCreated: 0 });
    // Budget still seeds even if goals/colleges fail.
    expect((await data.budget.get())?.totalBudget).toBe(200000);
  });
});

describe('makeSqsSeedEnqueuer', () => {
  it('runs the seed inline when no queue URL is configured', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const enqueue = makeSqsSeedEnqueuer(deps());
      await enqueue();
      expect((await data.goals.list()).length).toBe(2); // fell back to inline seedStudent
    } finally {
      if (prev !== undefined) process.env.HYDRATION_QUEUE_URL = prev;
    }
  });

  it('enqueues an onboarding-seed message (tenant + student) when a queue is configured', async () => {
    let captured: { QueueUrl?: string; MessageBody?: string } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = (cmd as { input?: { QueueUrl?: string; MessageBody?: string } }).input;
        return {};
      },
    };
    const enqueue = makeSqsSeedEnqueuer(deps(), { queueUrl: 'https://sqs.test/hydration', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue()));
    expect(captured?.QueueUrl).toBe('https://sqs.test/hydration');
    expect(JSON.parse(captured?.MessageBody ?? '{}')).toEqual({ type: SEED_TYPE, tenantId: 'fam1', studentId: 's1' });
    expect(await data.goals.list()).toEqual([]); // enqueued, not run inline
  });
});

describe('makeSeedWorkerHandler', () => {
  it('runs the seed for an onboarding-seed message and ignores other types', async () => {
    const handler = makeSeedWorkerHandler(deps());
    await handler({ type: 'something-else' });
    expect(await data.goals.list()).toEqual([]);
    await handler({ type: SEED_TYPE });
    expect((await data.goals.list()).length).toBe(2);
  });
});

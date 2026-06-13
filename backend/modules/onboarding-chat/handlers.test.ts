import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type OnboardingHandlers } from './handlers.js';
import type { CollegeSeeder, OnboardingChatter } from './ai.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';

const grahem: Requester = { username: 'grahem', role: 'admin' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let hydrated: string[];

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: grahem,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

// Stub chatter: echoes a fixed turn (or throws when asked, to exercise the fallback).
const stubChatter: OnboardingChatter = async () => ({
  reply: 'Got it — anything else?',
  profile: { intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse', graduationYear: 2029 },
  done: false,
});

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

function makeOnboarding(
  chatter: OnboardingChatter = stubChatter,
  suggester: GoalSuggester = stubSuggester,
  collegeSeeder: CollegeSeeder = stubCollegeSeeder,
): OnboardingHandlers {
  return makeHandlers({
    getData: () => data,
    chatter,
    suggester,
    collegeSeeder,
    hydrateDispatch: async (collegeId: string) => {
      hydrated.push(collegeId);
    },
    assetsDispatch: async () => {},
  });
}

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  hydrated = [];
});

describe('POST /onboarding/chat', () => {
  it('returns the chatter turn', async () => {
    const res = await makeOnboarding().chat(ctx({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: 'Got it — anything else?', done: false });
  });

  it('degrades to a gentle fallback (still 200) when the model errors', async () => {
    const boom: OnboardingChatter = async () => {
      throw new Error('bedrock down');
    };
    const res = await makeOnboarding(boom).chat(ctx({ body: { messages: [{ role: 'user', content: 'hi' }] } }));
    expect(res.status).toBe(200);
    expect((res.body as { done: boolean }).done).toBe(false);
    expect((res.body as { reply: string }).reply).toMatch(/once more|train of thought/i);
  });
});

describe('POST /onboarding/finish', () => {
  it('saves the profile (onboardingComplete + budget mapping), seeds goals, and seeds + hydrates colleges', async () => {
    const res = await makeOnboarding().finish(
      ctx({ body: { profile: { intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse', currentGPA: 3.8, budgetTotal: 200000 } } }),
    );
    expect(res.status).toBe(200);

    const profile = await data.studentProfile.get();
    expect(profile).toMatchObject({ onboardingComplete: true, careerGoal: 'ICU Nurse', currentGPA: 3.8, updatedBy: 'grahem' });
    expect(profile?.intendedMajors).toEqual(['Nursing']);
    expect(profile?.budget).toEqual({ total: 200000, currency: 'USD' });

    const goals = await data.goals.list();
    expect(goals.length).toBe(2);
    expect(goals.some((g) => g.title === 'Shadow a nurse')).toBe(true);

    const colleges = await data.colleges.list();
    expect(colleges.map((c) => c.name).sort()).toEqual(['State University', 'Tech Institute']);
    expect(colleges.every((c) => c.addedBy === 'ai-discovered' && c.hydrationStatus === 'in-progress')).toBe(true);

    const body = res.body as { goalsCreated: number; collegesCreated: number };
    expect(body.goalsCreated).toBe(2);
    expect(body.collegesCreated).toBe(2);
    expect(hydrated).toHaveLength(2); // hydration dispatched for each seeded college
  });

  it('does not duplicate a college that already exists', async () => {
    await data.colleges.create({ name: 'State University', status: 'researching' } as Parameters<Data['colleges']['create']>[0]);
    await makeOnboarding().finish(ctx({ body: { profile: { intendedMajors: ['Nursing'] } } }));
    const names = (await data.colleges.list()).map((c) => c.name.toLowerCase());
    expect(names.filter((n) => n === 'state university')).toHaveLength(1);
  });

  it('coerces a stringified GPA from the model JSON', async () => {
    await makeOnboarding().finish(ctx({ body: { profile: { currentGPA: '4.0', graduationYear: '2030' } } }));
    const profile = await data.studentProfile.get();
    expect(profile?.currentGPA).toBe(4.0);
    expect(profile?.graduationYear).toBe(2030);
  });

  it('reset (admin) clears setup but PRESERVES factual data; non-admin is forbidden', async () => {
    await makeOnboarding().finish(
      ctx({ body: { profile: { intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse', currentGPA: 3.9 } } }),
    );
    // A manually-added college (real research) must survive the reset.
    await data.colleges.create({ name: 'My Dream U', status: 'researching', addedBy: 'manual' } as Parameters<Data['colleges']['create']>[0]);
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(true);
    expect((await data.goals.list()).length).toBeGreaterThan(0);

    await expect(makeOnboarding().reset(ctx({ requester: kate }))).rejects.toMatchObject({ status: 403 });

    const res = await makeOnboarding().reset(ctx());
    expect(res.status).toBe(200);
    const profile = await data.studentProfile.get();
    expect(profile?.onboardingComplete).toBe(false);
    expect(profile?.intendedMajors).toEqual([]); // major cleared
    expect(profile?.currentGPA).toBe(3.9); // factual: PRESERVED
    expect(profile?.careerGoal).toBe('ICU Nurse'); // PRESERVED
    expect(await data.goals.list()).toEqual([]); // path regenerated
    const colleges = await data.colleges.list();
    expect(colleges.map((c) => c.name)).toEqual(['My Dream U']); // only the manual one survives
  });

  it('still finishes (profile saved) even if seeding throws', async () => {
    const angry: GoalSuggester = {
      suggest: async () => {
        throw new Error('suggester down');
      },
    };
    const angryCollegeSeeder: CollegeSeeder = async () => {
      throw new Error('seeder down');
    };
    const res = await makeOnboarding(stubChatter, angry, angryCollegeSeeder).finish(
      ctx({ body: { profile: { intendedMajors: ['Biology'] } } }),
    );
    expect(res.status).toBe(200);
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(true);
    expect((res.body as { goalsCreated: number; collegesCreated: number }).goalsCreated).toBe(0);
    expect((res.body as { collegesCreated: number }).collegesCreated).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type OnboardingHandlers } from './handlers.js';
import type { OnboardingChatter } from './ai.js';
import type { SeedDispatcher } from './seed.js';

const grahem: Requester = { username: 'grahem', role: 'admin' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let seedCalls: number;

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

// Spy seed dispatcher — finish ENQUEUES seeding (it must not run inline on the request path). The
// actual seeding logic is tested directly in seed.test.ts.
const spySeed: SeedDispatcher = async () => {
  seedCalls++;
};

function makeOnboarding(chatter: OnboardingChatter = stubChatter, seedDispatch: SeedDispatcher = spySeed): OnboardingHandlers {
  return makeHandlers({ getData: () => data, chatter, seedDispatch });
}

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  seedCalls = 0;
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
  it('saves the profile (onboardingComplete + budget mapping + GPA coercion) and ENQUEUES seeding (202)', async () => {
    const res = await makeOnboarding().finish(
      ctx({ body: { profile: { intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse', currentGPA: '3.8', graduationYear: '2030', budgetTotal: 200000 } } }),
    );
    // 202 = accepted; seeding runs in the background so the family isn't held on a spinner.
    expect(res.status).toBe(202);
    expect((res.body as { seeding: string }).seeding).toBe('queued');

    const profile = await data.studentProfile.get();
    expect(profile).toMatchObject({ onboardingComplete: true, careerGoal: 'ICU Nurse', updatedBy: 'grahem' });
    expect(profile?.currentGPA).toBe(3.8); // coerced from string
    expect(profile?.graduationYear).toBe(2030); // coerced from string
    expect(profile?.intendedMajors).toEqual(['Nursing']);
    expect(profile?.budget).toEqual({ total: 200000, currency: 'USD' });

    // Seeding is dispatched, NOT run inline (the whole point — it must stay off the request path).
    expect(seedCalls).toBe(1);
    expect(await data.goals.list()).toEqual([]); // nothing seeded synchronously
  });

  it('persists the colleges the family named (collegesOfInterest) onto the profile', async () => {
    const res = await makeOnboarding().finish(
      ctx({ body: { profile: { intendedMajors: ['Nursing'], collegesOfInterest: ['Cedarville University', 'Capital University'] } } }),
    );
    expect(res.status).toBe(202);
    expect((await data.studentProfile.get())?.collegesOfInterest).toEqual(['Cedarville University', 'Capital University']);
  });

  it('still returns 202 (profile saved) even if the seed dispatch fails', async () => {
    const angryDispatch: SeedDispatcher = async () => {
      throw new Error('queue down');
    };
    const res = await makeOnboarding(stubChatter, angryDispatch).finish(
      ctx({ body: { profile: { intendedMajors: ['Biology'] } } }),
    );
    expect(res.status).toBe(202);
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(true);
  });

  it('reset (admin) clears setup but PRESERVES factual data; non-admin is forbidden', async () => {
    // Set up a completed, seeded state directly (seeding itself is covered in seed.test.ts).
    await data.studentProfile.put({
      onboardingComplete: true,
      intendedMajors: ['Nursing'],
      careerGoal: 'ICU Nurse',
      currentGPA: 3.9,
    } as Parameters<Data['studentProfile']['put']>[0]);
    await data.goals.create({ title: 'Shadow a nurse', category: 'clinical' } as Parameters<Data['goals']['create']>[0]);
    await data.colleges.create({ name: 'AI Pick', status: 'researching', addedBy: 'ai-discovered' } as Parameters<Data['colleges']['create']>[0]);
    await data.colleges.create({ name: 'My Dream U', status: 'researching', addedBy: 'manual' } as Parameters<Data['colleges']['create']>[0]);

    await expect(makeOnboarding().reset(ctx({ requester: kate }))).rejects.toMatchObject({ status: 403 });

    const res = await makeOnboarding().reset(ctx());
    expect(res.status).toBe(200);
    const profile = await data.studentProfile.get();
    expect(profile?.onboardingComplete).toBe(false);
    expect(profile?.intendedMajors).toEqual([]); // major cleared
    expect(profile?.currentGPA).toBe(3.9); // factual: PRESERVED
    expect(profile?.careerGoal).toBe('ICU Nurse'); // PRESERVED
    expect(await data.goals.list()).toEqual([]); // path regenerated
    expect((await data.colleges.list()).map((c) => c.name)).toEqual(['My Dream U']); // only manual survives
  });
});

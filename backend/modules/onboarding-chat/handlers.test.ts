import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type OnboardingHandlers } from './handlers.js';
import type { OnboardingChatter } from './ai.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';

const grahem: Requester = { username: 'grahem', role: 'admin' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let dispatched: string[];

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

function makeOnboarding(chatter: OnboardingChatter = stubChatter): OnboardingHandlers {
  return makeHandlers({
    getData: () => data,
    chatter,
    suggester: stubSuggester,
    discoverDispatch: async (jobId: string) => {
      dispatched.push(jobId);
    },
  });
}

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatched = [];
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
  it('saves the profile (onboardingComplete + budget mapping), seeds goals, and kicks off discovery', async () => {
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

    const body = res.body as { goalsCreated: number; discoveryJobId: string | null };
    expect(body.goalsCreated).toBe(2);
    expect(body.discoveryJobId).toBeTruthy();
    expect(dispatched).toHaveLength(1);
  });

  it('coerces a stringified GPA from the model JSON', async () => {
    await makeOnboarding().finish(ctx({ body: { profile: { currentGPA: '4.0', graduationYear: '2030' } } }));
    const profile = await data.studentProfile.get();
    expect(profile?.currentGPA).toBe(4.0);
    expect(profile?.graduationYear).toBe(2030);
  });

  it('reset (admin) clears the profile + wipes goals/colleges; non-admin is forbidden', async () => {
    await makeOnboarding().finish(ctx({ body: { profile: { intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse' } } }));
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(true);
    expect((await data.goals.list()).length).toBeGreaterThan(0);

    await expect(makeOnboarding().reset(ctx({ requester: kate }))).rejects.toMatchObject({ status: 403 });

    const res = await makeOnboarding().reset(ctx());
    expect(res.status).toBe(200);
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(false);
    expect((await data.studentProfile.get())?.careerGoal).toBeUndefined();
    expect(await data.goals.list()).toEqual([]);
  });

  it('still finishes (profile saved) even if seeding throws', async () => {
    const angry: GoalSuggester = {
      suggest: async () => {
        throw new Error('suggester down');
      },
    };
    const handlers = makeHandlers({
      getData: () => data,
      chatter: stubChatter,
      suggester: angry,
      discoverDispatch: async (jobId) => {
        dispatched.push(jobId);
      },
    });
    const res = await handlers.finish(ctx({ body: { profile: { intendedMajors: ['Biology'] } } }));
    expect(res.status).toBe(200);
    expect((await data.studentProfile.get())?.onboardingComplete).toBe(true);
    expect((res.body as { goalsCreated: number }).goalsCreated).toBe(0);
  });
});

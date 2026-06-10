import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type ProfileHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: ProfileHandlers;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data });
});
const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

describe('GET /profile', () => {
  it('returns onboardingComplete:false default when nothing is saved', async () => {
    const res = await h.get(ctx());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ onboardingComplete: false });
  });
});

describe('PUT /profile', () => {
  it('creates, merges across calls, and records updatedBy', async () => {
    await h.put(ctx({ requester: kate, body: { name: 'Keira', graduationYear: 2029 } }));
    const res = await h.put(ctx({ body: { currentGPA: 4.0, onboardingComplete: true } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Keira', // preserved from the first PUT
      graduationYear: 2029,
      currentGPA: 4.0,
      onboardingComplete: true,
      updatedBy: 'keira',
    });
  });

  it('422 on an unknown field', async () => {
    await expect(h.put(ctx({ body: { nope: 1 } }))).rejects.toMatchObject({ status: 422 });
  });

  it('422 on an out-of-range graduation year', async () => {
    await expect(h.put(ctx({ body: { graduationYear: 1800 } }))).rejects.toMatchObject({ status: 422 });
  });
});

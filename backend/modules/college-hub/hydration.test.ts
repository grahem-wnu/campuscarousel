import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { College } from '../../shared/data/index.js';
import type { Hydrator } from './ai.js';
import { HYDRATION_TYPE, hydrateCollege, makeInlineDispatcher, makeWorkerHandler } from './hydration.js';

let data: Data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

const getData = () => data;

/** A hydrator that fills location + a flag and reports complete. */
const stubHydrator: Hydrator = async ({ name }) => ({
  location: `${name} City`,
  ranking: 'Top 100',
  hydrationStatus: 'complete',
});

async function seed(over: Partial<College> = {}): Promise<string> {
  const c = await data.colleges.create({
    name: 'Ohio State',
    userEdited: [],
    ...over,
  } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

describe('hydrateCollege', () => {
  it('merges AI fields and sets status, preserving user-edited fields', async () => {
    const id = await seed({ ranking: 'My ranking', userEdited: ['ranking'] });
    await hydrateCollege(getData, stubHydrator, id);
    const after = await data.colleges.get(id);
    expect(after?.location).toBe('Ohio State City'); // AI filled
    expect(after?.ranking).toBe('My ranking'); // user edit preserved (in userEdited[])
    expect(after?.hydrationStatus).toBe('complete');
    expect(after?.lastDataRefresh).toBeTruthy();
  });

  it('is a no-op for a missing college', async () => {
    await expect(hydrateCollege(getData, stubHydrator, 'ghost')).resolves.toBeUndefined();
  });
});

describe('makeInlineDispatcher', () => {
  it('hydrates synchronously', async () => {
    const id = await seed();
    await makeInlineDispatcher(getData, stubHydrator)(id);
    expect((await data.colleges.get(id))?.location).toBe('Ohio State City');
  });
});

describe('makeWorkerHandler', () => {
  it('hydrates from a well-formed message', async () => {
    const id = await seed();
    await makeWorkerHandler(getData, stubHydrator)({ type: HYDRATION_TYPE, collegeId: id });
    expect((await data.colleges.get(id))?.ranking).toBe('Top 100');
  });

  it('ignores a malformed message (no collegeId)', async () => {
    await expect(makeWorkerHandler(getData, stubHydrator)({ type: HYDRATION_TYPE })).resolves.toBeUndefined();
    await expect(makeWorkerHandler(getData, stubHydrator)(null)).resolves.toBeUndefined();
  });
});

// PRIVACY proof for the essay AI's experience pool: a `private` journal/clinical/why-nursing entry is
// included ONLY when keira (student) is the authenticated caller; a parent/admin gets family-visible
// only. Enforced via the shared aiVisibleSet.

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { gatherExperiences, poolToText } from './grounding.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Soup kitchen', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private reflection', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  await data.clinical.create({ date: '2026-02-01', facility: 'County Hospital', hours: 4, visibility: 'family' } as Parameters<Data['clinical']['create']>[0]);
  await data.whyNursing.create({ date: '2026-03-02', title: 'A private moment with Marcus', content: 'secret', visibility: 'private' } as Parameters<Data['whyNursing']['create']>[0]);
});

describe('gatherExperiences — privacy (the canonical essay case)', () => {
  it('keira sees private entries in the essay pool', async () => {
    const pool = await gatherExperiences(data, keira);
    expect(pool.includesPrivate).toBe(true);
    expect(pool.experiences.some((e) => e.title.includes('Private'))).toBe(true);
    expect(poolToText(pool)).toMatch(/private moment with Marcus/i);
  });

  it('a parent NEVER sees private entries in the essay pool', async () => {
    const pool = await gatherExperiences(data, kate);
    expect(pool.includesPrivate).toBe(false);
    expect(pool.experiences.some((e) => e.title.includes('Private'))).toBe(false);
    expect(pool.counts).toEqual({ activities: 1, clinical: 1, whyNursing: 0 });
  });

  it('an admin is treated like a parent', async () => {
    expect((await gatherExperiences(data, grahem)).includesPrivate).toBe(false);
  });
});

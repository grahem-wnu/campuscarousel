// PRIVACY proof for interview grounding: the AI's grounding context includes a `private` journal /
// clinical / why-nursing entry ONLY when keira (student) is the authenticated caller. A parent or
// admin running a mock gets family-visible entries only. Enforced via the shared aiVisibleSet.

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { gatherGrounding, groundingToText } from './grounding.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Family activity', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private reflection', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  await data.clinical.create({ date: '2026-02-01', facility: 'County Hospital', hours: 4, visibility: 'family' } as Parameters<Data['clinical']['create']>[0]);
  await data.clinical.create({ date: '2026-02-02', facility: 'Private clinic', hours: 3, visibility: 'private', reflection: 'secret' } as Parameters<Data['clinical']['create']>[0]);
  await data.whyNursing.create({ date: '2026-03-01', title: 'A public moment', content: 'x', visibility: 'family' } as Parameters<Data['whyNursing']['create']>[0]);
  await data.whyNursing.create({ date: '2026-03-02', title: 'A private moment', content: 'y', visibility: 'private' } as Parameters<Data['whyNursing']['create']>[0]);
});

describe('gatherGrounding — privacy', () => {
  it('keira (student) SEES private entries in the grounding', async () => {
    const g = await gatherGrounding(data, keira);
    expect(g.includesPrivate).toBe(true);
    expect(g.counts).toEqual({ activities: 2, clinical: 2, whyNursing: 2 });
    expect(g.experiences.some((e) => e.title === 'Private reflection')).toBe(true);
  });

  it('a parent NEVER sees private entries in the grounding', async () => {
    const g = await gatherGrounding(data, kate);
    expect(g.includesPrivate).toBe(false);
    expect(g.counts).toEqual({ activities: 1, clinical: 1, whyNursing: 1 });
    expect(g.experiences.some((e) => e.title.includes('Private'))).toBe(false);
    expect(g.experiences.some((e) => e.detail === 'secret')).toBe(false);
  });

  it('an admin is treated like a parent (not privileged for private)', async () => {
    const g = await gatherGrounding(data, grahem);
    expect(g.includesPrivate).toBe(false);
    expect(g.counts.activities).toBe(1);
  });
});

describe('groundingToText', () => {
  it('renders experiences and an empty marker', async () => {
    const g = await gatherGrounding(data, keira);
    expect(groundingToText(g)).toMatch(/\[activity 2026-01-02\] Private reflection/);
    expect(groundingToText({ experiences: [], counts: { activities: 0, clinical: 0, whyNursing: 0 }, includesPrivate: false })).toBe('(no logged experiences yet)');
  });
});

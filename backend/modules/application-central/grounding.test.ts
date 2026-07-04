// PRIVACY proof for the essay AI's experience pool: a `private` journal/experience/motivation entry is
// included ONLY when keira (student) is the authenticated caller; a parent/admin gets family-visible
// only. Enforced via the shared aiVisibleSet.

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { collegeToText, gatherCollegeContext, gatherExperiences, poolToText } from './grounding.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Soup kitchen', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private reflection', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  await data.experiences.create({ date: '2026-02-01', facility: 'County Hospital', hours: 4, visibility: 'family' } as Parameters<Data['experiences']['create']>[0]);
  await data.motivations.create({ date: '2026-03-02', title: 'A private moment with Marcus', content: 'secret', visibility: 'private' } as Parameters<Data['motivations']['create']>[0]);
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
    expect(pool.counts).toEqual({ activities: 1, experiences: 1, motivations: 0 });
  });

  it('an admin is treated like a parent', async () => {
    expect((await gatherExperiences(data, grahem)).includesPrivate).toBe(false);
  });
});

describe('gatherCollegeContext — what the target school looks for', () => {
  it('assembles college + benchmark context and renders it for a prompt', async () => {
    const college = await data.colleges.create({
      name: 'Ohio State',
      overview: 'Big-ten flagship with a direct-admit BSN.',
      admissionsDeepDive: 'Direct admit is holistic; essays carry real weight.',
      essayPrompts: ['Why OSU nursing?', 'Describe a community you serve.'],
    } as Parameters<Data['colleges']['create']>[0]);
    await data.benchmarks.put(college.collegeId, { competitiveEdges: ['200+ clinical hours', 'CNA license'] } as Parameters<Data['benchmarks']['put']>[1]);

    const ctx = await gatherCollegeContext(data, college.collegeId);
    expect(ctx?.name).toBe('Ohio State');
    expect(ctx?.essayPrompts).toHaveLength(2);
    expect(ctx?.competitiveEdges).toContain('CNA license');
    const text = collegeToText(ctx!);
    expect(text).toContain('Target college: Ohio State');
    expect(text).toContain('Why OSU nursing?');
    expect(text).toContain('stand out');
  });

  it('returns undefined with no collegeId or an unknown one (AI degrades gracefully)', async () => {
    expect(await gatherCollegeContext(data, undefined)).toBeUndefined();
    expect(await gatherCollegeContext(data, 'ghost')).toBeUndefined();
  });

  it('works without a benchmark row', async () => {
    const college = await data.colleges.create({ name: 'UC Irvine' } as Parameters<Data['colleges']['create']>[0]);
    const ctx = await gatherCollegeContext(data, college.collegeId);
    expect(ctx?.name).toBe('UC Irvine');
    expect(ctx?.competitiveEdges).toBeUndefined();
  });
});

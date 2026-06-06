import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, NotFoundError, type Data } from './index.js';
import { tableClientFromEnv } from './table-client.js';
import { buildActivity, buildClinical, seed } from './fixtures.js';

let client: InMemoryTableClient;
let data: Data;

beforeEach(() => {
  client = new InMemoryTableClient();
  data = makeData(client);
});

const INTERNAL = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'GSI3PK', 'GSI3SK', 'GSI4PK', 'GSI4SK'];
const hasNoInternal = (o: object) => INTERNAL.every((k) => !(k in o));

describe('standard entity CRUD (activities)', () => {
  it('creates with generated id + timestamps and strips internal attrs', async () => {
    const a = await data.activities.create(buildActivity({ title: 'Tutoring' }));
    expect(a.activityId).toMatch(/[0-9a-f-]{36}/);
    expect(a.createdAt).toBe(a.updatedAt);
    expect(a.title).toBe('Tutoring');
    expect(hasNoInternal(a)).toBe(true);
  });

  it('gets by id and returns null for a miss', async () => {
    const a = await data.activities.create(buildActivity());
    expect((await data.activities.get(a.activityId))?.activityId).toBe(a.activityId);
    expect(await data.activities.get('nope')).toBeNull();
  });

  it('require throws NotFoundError when absent', async () => {
    await expect(data.activities.require('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates fields, preserves createdAt, bumps updatedAt', async () => {
    const a = await data.activities.create(buildActivity());
    const updated = await data.activities.update(a.activityId, { hours: 9, reflection: 'Learned a lot' });
    expect(updated.hours).toBe(9);
    expect(updated.reflection).toBe('Learned a lot');
    expect(updated.createdAt).toBe(a.createdAt);
    expect(updated.updatedAt >= a.updatedAt).toBe(true);
    expect(hasNoInternal(updated)).toBe(true);
  });

  it('update on a missing id throws NotFoundError', async () => {
    await expect(data.activities.update('ghost', { hours: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes', async () => {
    const a = await data.activities.create(buildActivity());
    await data.activities.delete(a.activityId);
    expect(await data.activities.get(a.activityId)).toBeNull();
  });
});

describe('collection listing (GSI1) + ordering', () => {
  it('lists a whole collection ordered by date, ascending and descending', async () => {
    await data.activities.create(buildActivity({ date: '2026-03-01', title: 'C' }));
    await data.activities.create(buildActivity({ date: '2026-01-01', title: 'A' }));
    await data.activities.create(buildActivity({ date: '2026-02-01', title: 'B' }));
    const asc = await data.activities.list();
    expect(asc.map((a) => a.title)).toEqual(['A', 'B', 'C']);
    const desc = await data.activities.list({ ascending: false });
    expect(desc.map((a) => a.title)).toEqual(['C', 'B', 'A']);
    expect(await data.activities.list({ limit: 2 })).toHaveLength(2);
  });

  it('listByDateRange is inclusive and bounded', async () => {
    await data.activities.create(buildActivity({ date: '2025-12-31', title: 'before' }));
    await data.activities.create(buildActivity({ date: '2026-01-15', title: 'in' }));
    await data.activities.create(buildActivity({ date: '2026-01-31', title: 'edge' }));
    await data.activities.create(buildActivity({ date: '2026-02-01', title: 'after' }));
    const got = await data.activities.listByDateRange('2026-01-01', '2026-01-31');
    expect(got.map((a) => a.title).sort()).toEqual(['edge', 'in']);
  });

  it('keeps collections isolated from each other', async () => {
    await data.activities.create(buildActivity());
    await data.goals.create({ title: 'Take TEAS' });
    expect(await data.activities.list()).toHaveLength(1);
    expect(await data.goals.list()).toHaveLength(1);
  });

  it('returns BOTH family and private items (lib does not filter visibility)', async () => {
    await data.activities.create(buildActivity({ visibility: 'family' }));
    await data.activities.create(buildActivity({ visibility: 'private' }));
    const all = await data.activities.list();
    expect(all.map((a) => a.visibility).sort()).toEqual(['family', 'private']);
  });
});

describe('secondary index access patterns', () => {
  it('activities.listByCategory uses GSI2', async () => {
    await data.activities.create(buildActivity({ category: 'clinical', date: '2026-01-02' }));
    await data.activities.create(buildActivity({ category: 'volunteer', date: '2026-01-03' }));
    await data.activities.create(buildActivity({ category: 'clinical', date: '2026-01-01' }));
    const clinical = await data.activities.listByCategory('clinical');
    expect(clinical).toHaveLength(2);
    expect(clinical.every((a) => a.category === 'clinical')).toBe(true);
    expect(clinical.map((a) => a.date)).toEqual(['2026-01-01', '2026-01-02']); // ordered by date
  });

  it('clinical.listByFacility uses GSI3', async () => {
    await data.clinical.create(buildClinical({ facility: 'CHOC', date: '2026-01-01' }));
    await data.clinical.create(buildClinical({ facility: 'Mission', date: '2026-01-02' }));
    await data.clinical.create(buildClinical({ facility: 'CHOC', date: '2026-01-03' }));
    const choc = await data.clinical.listByFacility('CHOC');
    expect(choc).toHaveLength(2);
    expect(choc.every((c) => c.facility === 'CHOC')).toBe(true);
  });

  it('teas lists via GSI4 by date', async () => {
    await data.teas.create({ type: 'practice-test', date: '2026-02-01', overallScore: 70 });
    await data.teas.create({ type: 'practice-test', date: '2026-01-01', overallScore: 65 });
    const all = await data.teas.list();
    expect(all.map((t) => t.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(await data.teas.listByDateRange('2026-01-15', '2026-12-31')).toHaveLength(1);
  });
});

describe('hydration: mergePreservingUserEdits', () => {
  it('applies AI data but never overwrites a human-edited field', async () => {
    const college = await data.colleges.create({ name: 'Iowa', addedBy: 'manual' });
    // Human edits the name → recorded in userEdited.
    const edited = await data.colleges.update(college.collegeId, { name: 'University of Iowa' });
    expect(edited.userEdited).toContain('name');

    const merged = await data.colleges.mergePreservingUserEdits(college.collegeId, {
      name: 'Iowa State (WRONG)', // must be ignored — user edited name
      ranking: 'US News #15 BSN', // new AI field — applied
      hydrationStatus: 'complete',
    });
    expect(merged.name).toBe('University of Iowa'); // preserved
    expect(merged.ranking).toBe('US News #15 BSN'); // applied
    expect(merged.lastDataRefresh).toBeDefined();
  });

  it('hydrates a never-edited entity fully', async () => {
    const s = await data.scholarships.create({ name: 'Seed', addedBy: 'ai-discovered' });
    const merged = await data.scholarships.mergePreservingUserEdits(s.scholarshipId, {
      amount: 5000,
      provider: 'FNA',
    });
    expect(merged.amount).toBe(5000);
    expect(merged.provider).toBe('FNA');
  });
});

describe('college sub-entities (parent partition)', () => {
  it('notes: add + list ordered by time, scoped to the college', async () => {
    const c = await data.colleges.create({ name: 'Iowa' });
    const other = await data.colleges.create({ name: 'UCLA' });
    await data.collegeNotes.add(c.collegeId, { author: 'kate', content: 'first' });
    await data.collegeNotes.add(c.collegeId, { author: 'kate', content: 'second' });
    await data.collegeNotes.add(other.collegeId, { author: 'kate', content: 'elsewhere' });
    const notes = await data.collegeNotes.list(c.collegeId);
    expect(notes.map((n) => n.content)).toEqual(['first', 'second']);
    expect(notes[0]?.collegeId).toBe(c.collegeId);
    expect(hasNoInternal(notes[0]!)).toBe(true);
  });

  it('visits: full CRUD by visitId', async () => {
    const c = await data.colleges.create({ name: 'Iowa' });
    const v = await data.visits.add(c.collegeId, { date: '2026-04-01', wouldAttend: 'maybe' });
    const updated = await data.visits.update(c.collegeId, v.visitId, { wouldAttend: 'yes' });
    expect(updated.wouldAttend).toBe('yes');
    await data.visits.delete(c.collegeId, v.visitId);
    expect(await data.visits.get(c.collegeId, v.visitId)).toBeNull();
  });

  it('checklist + benchmark singletons', async () => {
    const c = await data.colleges.create({ name: 'Iowa' });
    await data.collegeChecklist.put(c.collegeId, [{ id: '1', label: 'Send transcripts', completed: false }]);
    expect((await data.collegeChecklist.get(c.collegeId))?.items).toHaveLength(1);

    await data.benchmarks.put(c.collegeId, { avgGPAAdmitted: 3.8 });
    const bm = await data.benchmarks.mergePreservingUserEdits(c.collegeId, { avgTEASScore: 85, avgGPAAdmitted: 4.0 });
    expect(bm.avgTEASScore).toBe(85);
    expect(bm.avgGPAAdmitted).toBe(4.0); // not user-edited, so AI value applies
  });
});

describe('conversations', () => {
  it('creates, lists, and appends ordered messages', async () => {
    const conv = await data.conversations.create({ userId: 'keira', context: 'journal' });
    await data.conversations.addMessage(conv.conversationId, { role: 'user', userId: 'keira', content: 'hi' });
    await data.conversations.addMessage(conv.conversationId, { role: 'assistant', userId: 'keira', content: 'hello' });
    const msgs = await data.conversations.listMessages(conv.conversationId);
    expect(msgs.map((m) => m.content)).toEqual(['hi', 'hello']);
    expect(await data.conversations.list()).toHaveLength(1);
    expect((await data.conversations.get(conv.conversationId))?.context).toBe('journal');
  });
});

describe('singletons', () => {
  it('budget put/get/update', async () => {
    await data.budget.put({ totalBudget: 200000, currency: 'USD' });
    expect((await data.budget.get())?.totalBudget).toBe(200000);
    const u = await data.budget.update({ notes: 'adjusted' });
    expect(u.notes).toBe('adjusted');
    expect(u.totalBudget).toBe(200000);
  });

  it('profiles are per-user', async () => {
    await data.profiles.put({ userId: 'keira', name: 'Keira', role: 'student' });
    await data.profiles.put({ userId: 'kate', name: 'Kate', role: 'parent' });
    expect((await data.profiles.get('keira'))?.role).toBe('student');
    const u = await data.profiles.update('keira', { preferences: { theme: 'dark' } });
    expect(u.preferences).toEqual({ theme: 'dark' });
    expect(await data.profiles.get('nobody')).toBeNull();
  });
});

describe('fixtures.seed', () => {
  it('seeds a family + private activity and related entities', async () => {
    const ids = await seed(data);
    expect(ids.familyActivityId).toBeDefined();
    expect(ids.privateActivityId).toBeDefined();
    const all = await data.activities.list();
    expect(all).toHaveLength(2);
    expect(await data.colleges.get(ids.collegeId)).not.toBeNull();
    expect(await data.scholarships.get(ids.scholarshipId)).not.toBeNull();
    expect(await data.clinical.get(ids.clinicalId)).not.toBeNull();
  });
});

describe('tableClientFromEnv', () => {
  it('throws a clear error when TABLE_NAME is unset', () => {
    expect(() => tableClientFromEnv({})).toThrow(/TABLE_NAME/);
  });
  it('builds when TABLE_NAME is present', () => {
    expect(() => tableClientFromEnv({ TABLE_NAME: 'keiras-journey-staging' })).not.toThrow();
  });
});

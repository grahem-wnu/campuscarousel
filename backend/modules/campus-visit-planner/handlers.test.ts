import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type VisitHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: VisitHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data }); // curated AI seams by default
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

async function seedCollege(over: Record<string, unknown> = {}): Promise<string> {
  const c = await data.colleges.create({ name: 'UC Irvine', ...over } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

describe('create / list (POST + GET /colleges/:id/visits)', () => {
  it('404s creating/listing under a missing college', async () => {
    await expectStatus(h.create(ctx({ params: { id: 'ghost' }, body: { date: '2026-04-01' } })), 404);
    await expectStatus(h.list(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('rejects unknown body fields including a client-supplied createdBy (strict) with 422', async () => {
    const id = await seedCollege();
    await expectStatus(h.create(ctx({ params: { id }, body: { date: '2026-04-01', createdBy: 'hacker' } })), 422);
  });

  it('creates then lists visits for the college', async () => {
    const id = await seedCollege();
    const created = await h.create(ctx({ requester: kate, params: { id }, body: { date: '2026-04-01', visitType: 'campus-tour' } }));
    expect(created.status).toBe(201);
    expect((created.body as { createdBy: string }).createdBy).toBe('kate');

    const list = await h.list(ctx({ params: { id } }));
    expect((list.body as { visits: unknown[] }).visits).toHaveLength(1);
  });

  it('422s on a bad date', async () => {
    const id = await seedCollege();
    await expectStatus(h.create(ctx({ params: { id }, body: { date: 'April 1' } })), 422);
  });
});

describe('update / remove', () => {
  it('adds a post-visit debrief via PUT', async () => {
    const id = await seedCollege();
    const created = await h.create(ctx({ params: { id }, body: { date: '2026-04-01' } }));
    const vid = (created.body as { visitId: string }).visitId;
    const res = await h.update(
      ctx({ params: { id, vid }, body: { impressions: 'Loved the sim lab', wouldAttend: 'yes', pros: ['great clinicals'] } }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { wouldAttend: string }).wouldAttend).toBe('yes');
  });

  it('404 on update/delete of a missing visit', async () => {
    const id = await seedCollege();
    await expectStatus(h.update(ctx({ params: { id, vid: 'ghost' }, body: { impressions: 'x' } })), 404);
    await expectStatus(h.remove(ctx({ params: { id, vid: 'ghost' } })), 404);
  });

  it('deletes a visit (204)', async () => {
    const id = await seedCollege();
    const created = await h.create(ctx({ params: { id }, body: { date: '2026-04-01' } }));
    const vid = (created.body as { visitId: string }).visitId;
    const res = await h.remove(ctx({ params: { id, vid } }));
    expect(res.status).toBe(204);
    expect(await data.visits.get(id, vid)).toBeNull();
  });
});

describe('prep (POST /colleges/:id/visits/:vid/prep)', () => {
  it('404s for a missing college or visit', async () => {
    await expectStatus(h.prep(ctx({ params: { id: 'ghost', vid: 'v' } })), 404);
    const id = await seedCollege();
    await expectStatus(h.prep(ctx({ params: { id, vid: 'ghost' } })), 404);
  });

  it('regenerates and returns the visit with the curated checklist + logistics cached on it', async () => {
    const id = await seedCollege({ contactInfo: { programAdmissionsEmail: 'nursing@uci.edu' } });
    const created = await h.create(ctx({ params: { id }, body: { date: '2026-04-01' } }));
    const vid = (created.body as { visitId: string }).visitId;
    const res = await h.prep(ctx({ params: { id, vid } }));
    expect(res.status).toBe(200);
    const prep = (res.body as { prep: { questions: string[]; logistics: { contact?: string }; source: string } }).prep;
    expect(prep.source).toBe('curated');
    expect(prep.questions.length).toBeGreaterThanOrEqual(8);
    expect(prep.logistics.contact).toBe('nursing@uci.edu');
    // It's persisted on the visit (so the UI shows/hides it without re-generating).
    expect((await data.visits.get(id, vid))?.prep?.questions.length).toBeGreaterThanOrEqual(8);
  });

  it("leads with the student's major-pack visit questions (nursing → NCLEX pass rate)", async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    const id = await seedCollege();
    const created = await h.create(ctx({ params: { id }, body: { date: '2026-04-01' } }));
    const vid = (created.body as { visitId: string }).visitId;
    const res = await h.prep(ctx({ params: { id, vid } }));
    const questions = (res.body as { prep: { questions: string[] } }).prep.questions;
    expect(questions.some((q) => /NCLEX/.test(q))).toBe(true);
  });

  it('generates and caches prep when the visit is created', async () => {
    const id = await seedCollege();
    const created = await h.create(ctx({ params: { id }, body: { date: '2026-04-01' } }));
    expect((created.body as { prep?: { questions: string[] } }).prep?.questions.length).toBeGreaterThanOrEqual(8);
  });
});

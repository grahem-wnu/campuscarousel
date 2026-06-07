import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type DicHandlers } from './handlers.js';
import type { Briefer } from './briefs.js';

const keira: Requester = { username: 'keira', role: 'student' };

const fakeBriefer: Briefer = { brief: async () => 'A warm, specific one-page brief.' };
const downBriefer: Briefer = { brief: () => Promise.reject(Object.assign(new Error('down'), { status: 503 })) };

let data: Data;
let h: DicHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => fakeBriefer);
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seedCollege(name = 'UCLA'): Promise<string> {
  const c = await data.colleges.create({ name } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

describe('touchpoints', () => {
  it('creates (recording createdBy from the JWT), lists, and 404s for an unknown college', async () => {
    const id = await seedCollege();
    const created = await h.createTouchpoint(
      ctx({ params: { id }, body: { type: 'campus-visit', date: '2026-03-01', description: 'Toured nursing sim lab' } }),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'campus-visit', createdBy: 'keira' });

    const list = await h.listTouchpoints(ctx({ params: { id } }));
    expect((list.body as { touchpoints: unknown[] }).touchpoints).toHaveLength(1);

    await expectStatus(h.createTouchpoint(ctx({ params: { id: 'ghost' }, body: { type: 'webinar', date: '2026-03-01' } })), 404);
    await expectStatus(h.listTouchpoints(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('422s an invalid touchpoint type or unknown field', async () => {
    const id = await seedCollege();
    await expectStatus(h.createTouchpoint(ctx({ params: { id }, body: { type: 'nope', date: '2026-03-01' } })), 422);
    await expectStatus(h.createTouchpoint(ctx({ params: { id }, body: { type: 'webinar', date: '2026-03-01', bogus: 1 } })), 422);
  });

  it('updates and deletes, 404ing when the touchpoint is missing', async () => {
    const id = await seedCollege();
    const created = await h.createTouchpoint(ctx({ params: { id }, body: { type: 'email-exchange', date: '2026-03-01' } }));
    const tid = (created.body as { touchpointId: string }).touchpointId;

    const updated = await h.updateTouchpoint(ctx({ params: { id, tid }, body: { notes: 'replied next day' } }));
    expect((updated.body as { notes: string }).notes).toBe('replied next day');

    await expectStatus(h.updateTouchpoint(ctx({ params: { id, tid: 'ghost' }, body: { notes: 'x' } })), 404);
    // A bad college id 404s too (update/delete verify the college, consistent with list/create).
    await expectStatus(h.updateTouchpoint(ctx({ params: { id: 'ghost', tid }, body: { notes: 'x' } })), 404);
    await expectStatus(h.deleteTouchpoint(ctx({ params: { id: 'ghost', tid } })), 404);

    const del = await h.deleteTouchpoint(ctx({ params: { id, tid } }));
    expect(del.status).toBe(204);
    await expectStatus(h.deleteTouchpoint(ctx({ params: { id, tid } })), 404);
  });
});

describe('follow-ups (GET /touchpoints/follow-ups)', () => {
  it('returns pending follow-ups across colleges, soonest first, with the college name', async () => {
    const a = await seedCollege('UCLA');
    const b = await seedCollege('CSULB');
    await data.touchpoints.add(a, { type: 'email-exchange', date: '2026-01-01', followUpNeeded: true, followUpDate: '2026-05-01' });
    await data.touchpoints.add(b, { type: 'phone-call', date: '2026-01-02', followUpNeeded: true, followUpDate: '2026-02-01' });
    await data.touchpoints.add(a, { type: 'webinar', date: '2026-01-03', followUpNeeded: true, followUpCompleted: true }); // done → excluded

    const res = await h.followUps(ctx());
    const fus = (res.body as { followUps: { collegeName: string; followUpDate?: string }[] }).followUps;
    expect(fus).toHaveLength(2);
    expect(fus[0]?.collegeName).toBe('CSULB'); // 2026-02-01 sorts first
    expect(fus[1]?.collegeName).toBe('UCLA');
  });
});

describe('contacts', () => {
  it('creates, gets, updates, deletes (404 when missing)', async () => {
    const created = await h.createContact(ctx({ body: { name: 'Nurse Pat', relationship: 'nurse' } }));
    const cid = (created.body as { contactId: string }).contactId;
    expect(created.status).toBe(201);

    const got = await h.getContact(ctx({ params: { id: cid } }));
    expect((got.body as { name: string }).name).toBe('Nurse Pat');

    const upd = await h.updateContact(ctx({ params: { id: cid }, body: { organization: 'Hoag' } }));
    expect((upd.body as { organization: string }).organization).toBe('Hoag');

    await expectStatus(h.getContact(ctx({ params: { id: 'ghost' } })), 404);
    await expectStatus(h.updateContact(ctx({ params: { id: 'ghost' }, body: { notes: 'x' } })), 404);

    const del = await h.deleteContact(ctx({ params: { id: cid } }));
    expect(del.status).toBe(204);
    await expectStatus(h.deleteContact(ctx({ params: { id: cid } })), 404);
  });

  it('422s an unknown relationship or recommender slot', async () => {
    await expectStatus(h.createContact(ctx({ body: { name: 'X', relationship: 'bff' } })), 422);
    await expectStatus(h.createContact(ctx({ body: { name: 'X', recommenderSlot: 'lunch-buddy' } })), 422);
  });
});

describe('recommenders (GET /contacts/recommenders)', () => {
  it('groups potential recommenders by slot and reports coverage gaps', async () => {
    await data.contacts.create({ name: 'Mr. Chu', isPotentialRecommender: true, recommenderSlot: 'stem-teacher' } as Parameters<Data['contacts']['create']>[0]);
    await data.contacts.create({ name: 'Just a friend' } as Parameters<Data['contacts']['create']>[0]);
    const res = await h.recommenders(ctx());
    const body = res.body as { groups: { slot: string; contacts: unknown[] }[]; gaps: string[] };
    expect(body.groups.find((g) => g.slot === 'stem-teacher')?.contacts).toHaveLength(1);
    expect(body.gaps).toContain('humanities-teacher');
  });
});

describe('recommender-brief (POST /contacts/:id/recommender-brief)', () => {
  it('returns an AI brief for an existing contact', async () => {
    const c = await data.contacts.create({ name: 'Mr. Chu' } as Parameters<Data['contacts']['create']>[0]);
    const res = await h.recommenderBrief(ctx({ params: { id: c.contactId }, body: {} }));
    expect(res.status).toBe(200);
    expect((res.body as { brief: string }).brief).toContain('one-page brief');
  });

  it('404s for an unknown contact', async () => {
    await expectStatus(h.recommenderBrief(ctx({ params: { id: 'ghost' }, body: {} })), 404);
  });

  it('propagates a 503 when AI is unavailable', async () => {
    const hh = makeHandlers(() => data, () => downBriefer);
    const c = await data.contacts.create({ name: 'Mr. Chu' } as Parameters<Data['contacts']['create']>[0]);
    await expectStatus(hh.recommenderBrief(ctx({ params: { id: c.contactId }, body: {} })), 503);
  });
});

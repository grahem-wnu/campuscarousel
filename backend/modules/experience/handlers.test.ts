import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type ExperienceHandlers } from './handlers.js';
import type { ExperienceSummary } from './summary.js';
import type { SupervisorEntry } from './supervisors.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const grahem: Requester = { username: 'grahem', role: 'admin' };

let data: Data;
let h: ExperienceHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data);
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

/** Seed an experience entry directly via the data layer (bypassing the create handler). */
async function seed(over: Record<string, unknown> = {}): Promise<string> {
  const c = await data.experiences.create({
    date: '2026-01-10',
    facility: 'Memorial Hospital',
    hours: 4,
    visibility: 'family',
    ...over,
  } as Parameters<Data['experiences']['create']>[0]);
  return c.entryId;
}

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

describe('create (POST /experience)', () => {
  it('defaults visibility to family', async () => {
    const res = await h.create(
      ctx({ requester: kate, body: { date: '2026-02-01', facility: 'Clinic A', hours: 3 } }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ visibility: 'family', facility: 'Clinic A', hours: 3 });
  });

  it('lets Keira mark an entry private', async () => {
    const res = await h.create(
      ctx({ body: { date: '2026-02-01', facility: 'Clinic A', hours: 2, visibility: 'private' } }),
    );
    expect(res.status).toBe(201);
    expect((res.body as { visibility: string }).visibility).toBe('private');
  });

  it('FORBIDS a parent from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: kate, body: { date: '2026-02-01', facility: 'A', hours: 1, visibility: 'private' } })),
      403,
    );
  });

  it('FORBIDS an admin from marking an entry private', async () => {
    await expectStatus(
      h.create(ctx({ requester: grahem, body: { date: '2026-02-01', facility: 'A', hours: 1, visibility: 'private' } })),
      403,
    );
  });

  it('422s on invalid input (missing facility/hours, bad date, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', hours: 3 } })), 422); // no facility
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', facility: 'A' } })), 422); // no hours
    await expectStatus(h.create(ctx({ body: { date: 'Feb 1', facility: 'A', hours: 3 } })), 422); // bad date
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', facility: 'A', hours: 3, bogus: 1 } })), 422);
    await expectStatus(h.create(ctx({ body: { date: '2026-02-01', facility: 'A', hours: -1 } })), 422); // negative
  });
});

describe('list (GET /experience) — visibility filtering', () => {
  beforeEach(async () => {
    await seed({ facility: 'Memorial', department: 'ER', visibility: 'family', date: '2026-01-01', hours: 4 });
    await seed({ facility: 'Memorial', department: 'ICU', visibility: 'private', date: '2026-01-02', hours: 5 });
    await seed({ facility: 'Lakeside', department: 'ER', visibility: 'family', date: '2026-01-03', hours: 6 });
  });

  it('Keira sees ALL (family + private)', async () => {
    const res = await h.list(ctx({ requester: keira }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(3);
  });

  it('a parent sees ONLY family (private hidden)', async () => {
    const res = await h.list(ctx({ requester: kate }));
    const items = (res.body as { entries: { visibility: string }[] }).entries;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.visibility === 'family')).toBe(true);
  });

  it('an admin sees ONLY family (not privileged for private)', async () => {
    const res = await h.list(ctx({ requester: grahem }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('filters by facility', async () => {
    const res = await h.list(ctx({ requester: keira, query: { facility: 'Lakeside' } }));
    const items = (res.body as { entries: { facility: string }[] }).entries;
    expect(items).toHaveLength(1);
    expect(items[0]?.facility).toBe('Lakeside');
  });

  it('filters by department', async () => {
    const res = await h.list(ctx({ requester: keira, query: { department: 'ER' } }));
    const items = (res.body as { entries: { department: string }[] }).entries;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.department === 'ER')).toBe(true);
  });

  it('filters by date range (and still hides private from a parent)', async () => {
    const res = await h.list(ctx({ requester: kate, query: { from: '2026-01-01', to: '2026-01-31' } }));
    expect((res.body as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('facility + department filters compose', async () => {
    const res = await h.list(ctx({ requester: keira, query: { facility: 'Memorial', department: 'ICU' } }));
    const items = (res.body as { entries: unknown[] }).entries;
    expect(items).toHaveLength(1);
  });
});

describe('detail (GET /experience/:id)', () => {
  it('a parent gets 403 on a private entry, 200 on a family entry', async () => {
    const privateId = await seed({ visibility: 'private' });
    const familyId = await seed({ visibility: 'family' });
    await expectStatus(h.detail(ctx({ requester: kate, params: { id: privateId } })), 403);
    const ok = await h.detail(ctx({ requester: kate, params: { id: familyId } }));
    expect(ok.status).toBe(200);
  });

  it('Keira can read her private entry', async () => {
    const id = await seed({ visibility: 'private' });
    const res = await h.detail(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(200);
  });

  it('404 when missing', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('update (PUT /experience/:id)', () => {
  it('a parent cannot update a private entry (403)', async () => {
    const id = await seed({ visibility: 'private' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { hours: 99 } })), 403);
  });

  it('a parent cannot flip a family entry to private (403)', async () => {
    const id = await seed({ visibility: 'family' });
    await expectStatus(h.update(ctx({ requester: kate, params: { id }, body: { visibility: 'private' } })), 403);
  });

  it('Keira can update her private entry', async () => {
    const id = await seed({ visibility: 'private' });
    const res = await h.update(ctx({ requester: keira, params: { id }, body: { hours: 7 } }));
    expect(res.status).toBe(200);
    expect((res.body as { hours: number }).hours).toBe(7);
  });

  it('404 when missing', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { hours: 1 } })), 404);
  });
});

describe('remove (DELETE /experience/:id)', () => {
  it('a parent cannot delete a private entry (403)', async () => {
    const id = await seed({ visibility: 'private' });
    await expectStatus(h.remove(ctx({ requester: kate, params: { id } })), 403);
    expect(await data.experiences.get(id)).not.toBeNull(); // still there
  });

  it('Keira can delete her private entry (204)', async () => {
    const id = await seed({ visibility: 'private' });
    const res = await h.remove(ctx({ requester: keira, params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.experiences.get(id)).toBeNull();
  });
});

describe('summary (GET /experience/summary) — visibility filtering', () => {
  beforeEach(async () => {
    await seed({ facility: 'Memorial', hours: 3, patientInteraction: true, visibility: 'family', date: '2026-01-05' });
    await seed({ facility: 'Memorial', hours: 5, patientInteraction: false, visibility: 'private', date: '2026-02-05' });
  });

  it("Keira's summary includes private hours", async () => {
    const res = await h.summary(ctx({ requester: keira }));
    const s = res.body as ExperienceSummary;
    expect(s.totalHours).toBe(8);
    expect(s.totalEntries).toBe(2);
    expect(s.patientInteractionHours).toBe(3);
  });

  it("a parent's summary EXCLUDES private hours", async () => {
    const res = await h.summary(ctx({ requester: kate }));
    const s = res.body as ExperienceSummary;
    expect(s.totalHours).toBe(3);
    expect(s.totalEntries).toBe(1);
  });
});

describe('supervisors (GET /experience/supervisors) — visibility filtering', () => {
  beforeEach(async () => {
    await seed({ supervisorName: 'Dr. Public', hours: 4, visibility: 'family' });
    await seed({ supervisorName: 'Dr. Secret', hours: 6, visibility: 'private' });
  });

  it('Keira sees supervisors from all entries', async () => {
    const res = await h.supervisors(ctx({ requester: keira }));
    const dir = (res.body as { supervisors: SupervisorEntry[] }).supervisors;
    expect(dir.map((s) => s.name).sort()).toEqual(['Dr. Public', 'Dr. Secret']);
  });

  it('a parent never sees a supervisor that only appears on a private entry', async () => {
    const res = await h.supervisors(ctx({ requester: kate }));
    const dir = (res.body as { supervisors: SupervisorEntry[] }).supervisors;
    expect(dir.map((s) => s.name)).toEqual(['Dr. Public']);
  });
});

describe('export (POST /experience/export) — visibility filtering', () => {
  beforeEach(async () => {
    await seed({ facility: 'Memorial', hours: 3, visibility: 'family', date: '2026-01-05' });
    await seed({ facility: 'Memorial', hours: 5, visibility: 'private', date: '2026-02-05', reflection: 'secret' });
  });

  function decode(body: unknown): string {
    const { contentType, base64 } = body as { contentType: string; base64: string };
    expect(contentType).toBe('application/pdf');
    return Buffer.from(base64, 'base64').toString('latin1');
  }

  it('produces a valid PDF for Keira including private entries', async () => {
    const res = await h.exportPdf(ctx({ requester: keira, body: {} }));
    expect(res.status).toBe(200);
    const pdf = decode(res.body);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.includes('%%EOF')).toBe(true);
    expect(pdf.includes('Total hours: 8')).toBe(true);
  });

  it("a parent's export EXCLUDES private hours (totals only family)", async () => {
    const res = await h.exportPdf(ctx({ requester: kate, body: {} }));
    const pdf = decode(res.body);
    expect(pdf.includes('Total hours: 3')).toBe(true);
    expect(pdf.includes('Total hours: 8')).toBe(false);
  });

  it('tolerates a missing body (undefined)', async () => {
    const res = await h.exportPdf(ctx({ requester: keira, body: undefined }));
    expect(res.status).toBe(200);
  });

  it('422s on an unknown export field', async () => {
    await expectStatus(h.exportPdf(ctx({ requester: keira, body: { bogus: true } })), 422);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type CertHandlers } from './handlers.js';
import type { Suggester } from './suggester.js';
import type { DecoratedCertification } from './status.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

// Pin "today" so expiration-derived status is deterministic regardless of the real clock.
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: CertHandlers;
let suggestCalls: { careerGoal: string; existingNames: string[] }[];

/** A capturing stub suggester so handler tests assert wiring (goal source + existing-name dedupe). */
const stubSuggester: Suggester = async (input) => {
  suggestCalls.push(input);
  return [{ name: `suggested-for:${input.careerGoal}`, why: 'because', priority: 1 }];
};

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  suggestCalls = [];
  h = makeHandlers({ getData: () => data, now, suggester: stubSuggester });
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

async function seed(over: Record<string, unknown> = {}): Promise<string> {
  const c = await data.certifications.create({ name: 'Seed', ...over } as Parameters<
    Data['certifications']['create']
  >[0]);
  return c.certId;
}

describe('create (POST /certifications)', () => {
  it('creates and returns a decorated cert (201)', async () => {
    const res = await h.create(
      ctx({ body: { name: 'BLS/CPR', status: 'active', expirationDate: '2026-07-01' } }),
    );
    expect(res.status).toBe(201);
    const body = res.body as DecoratedCertification;
    expect(body.name).toBe('BLS/CPR');
    expect(body.effectiveStatus).toBe('expiring-soon'); // 25 days out
    expect(body.daysUntilExpiration).toBe(25);
  });

  it('lets a parent create too (family-visible entity, no role gate)', async () => {
    const res = await h.create(ctx({ requester: kate, body: { name: 'First Aid' } }));
    expect(res.status).toBe(201);
  });

  it('422s on invalid input (missing name, bad date, bad url, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: {} })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'x', expirationDate: 'July' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'x', documentUrl: 'not-a-url' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'x', bogus: 1 } })), 422);
  });

  it('422s when writing a DERIVED status (expiring-soon / expired are read-only)', async () => {
    await expectStatus(h.create(ctx({ body: { name: 'x', status: 'expired' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'x', status: 'expiring-soon' } })), 422);
  });
});

describe('list (GET /certifications)', () => {
  beforeEach(async () => {
    await seed({ name: 'Far', status: 'active', expirationDate: '2027-01-01' });
    await seed({ name: 'Near', status: 'active', expirationDate: '2026-07-01' });
    await seed({ name: 'Past', status: 'active', expirationDate: '2026-01-01' });
    await seed({ name: 'Planned', status: 'planned' });
  });

  it('returns every cert, decorated', async () => {
    const res = await h.list(ctx());
    const items = (res.body as { certifications: DecoratedCertification[] }).certifications;
    expect(items).toHaveLength(4);
    expect(items.every((c) => 'effectiveStatus' in c)).toBe(true);
  });

  it('filters by EFFECTIVE status', async () => {
    const filtered = async (status: string) =>
      (
        (await h.list(ctx({ query: { status } }))).body as {
          certifications: DecoratedCertification[];
        }
      ).certifications;
    expect((await filtered('expiring-soon')).map((c) => c.name)).toEqual(['Near']);
    expect((await filtered('expired')).map((c) => c.name)).toEqual(['Past']);
    expect((await filtered('active')).map((c) => c.name)).toEqual(['Far']);
    expect((await filtered('planned')).map((c) => c.name)).toEqual(['Planned']);
  });
});

describe('expiring (GET /certifications/expiring)', () => {
  beforeEach(async () => {
    await seed({ name: 'Far', status: 'active', expirationDate: '2027-01-01' });
    await seed({ name: 'Near', status: 'active', expirationDate: '2026-07-01' });
    await seed({ name: 'Past', status: 'active', expirationDate: '2026-01-01' });
    await seed({ name: 'NoExp', status: 'active' });
  });

  it('defaults to a 90-day window and excludes expired / non-expiring', async () => {
    const res = await h.expiring(ctx());
    const body = res.body as { certifications: DecoratedCertification[]; days: number };
    expect(body.days).toBe(90);
    expect(body.certifications.map((c) => c.name)).toEqual(['Near']);
  });

  it('honors a wider window and sorts soonest-first', async () => {
    const res = await h.expiring(ctx({ query: { days: '400' } }));
    const items = (res.body as { certifications: DecoratedCertification[] }).certifications;
    expect(items.map((c) => c.name)).toEqual(['Near', 'Far']);
  });

  it('422s on a non-positive window', async () => {
    await expectStatus(h.expiring(ctx({ query: { days: '0' } })), 422);
  });
});

describe('detail / update / remove (by id)', () => {
  it('detail returns decorated, 404 when missing', async () => {
    const id = await seed({ name: 'BLS', status: 'active', expirationDate: '2026-07-01' });
    const res = await h.detail(ctx({ params: { id } }));
    expect((res.body as DecoratedCertification).effectiveStatus).toBe('expiring-soon');
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('update mutates and returns 200, 404 when missing', async () => {
    const id = await seed({ name: 'BLS' });
    const res = await h.update(ctx({ params: { id }, body: { issuingOrganization: 'AHA' } }));
    expect(res.status).toBe(200);
    expect((res.body as DecoratedCertification).issuingOrganization).toBe('AHA');
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { name: 'x' } })), 404);
  });

  it('remove deletes and returns 204, 404 when missing', async () => {
    const id = await seed({ name: 'BLS' });
    const res = await h.remove(ctx({ params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.certifications.get(id)).toBeNull();
    await expectStatus(h.remove(ctx({ params: { id: 'ghost' } })), 404);
  });
});

describe('suggest (POST /certifications/suggest)', () => {
  it('uses an explicit careerGoal from the body and passes held cert names for dedupe', async () => {
    await seed({ name: 'BLS/CPR' });
    const res = await h.suggest(ctx({ body: { careerGoal: 'ER nurse' } }));
    const body = res.body as { careerGoal: string; suggestions: { name: string }[] };
    expect(body.careerGoal).toBe('ER nurse');
    expect(suggestCalls).toHaveLength(1);
    expect(suggestCalls[0]?.careerGoal).toBe('ER nurse');
    expect(suggestCalls[0]?.existingNames).toContain('BLS/CPR');
  });

  it('falls back to the profile career goal when the body omits one', async () => {
    await data.profiles.put({
      userId: 'keira',
      name: 'Keira',
      role: 'student',
      preferences: { careerGoal: 'NICU nurse' },
    });
    const res = await h.suggest(ctx({ body: {} }));
    expect((res.body as { careerGoal: string }).careerGoal).toBe('NICU nurse');
  });

  it('falls back to the default goal when neither body nor profile supplies one', async () => {
    const res = await h.suggest(ctx({ body: {} }));
    expect((res.body as { careerGoal: string }).careerGoal).toMatch(/college-bound/i);
  });

  it('422s on an unknown body field', async () => {
    await expectStatus(h.suggest(ctx({ body: { bogus: 1 } })), 422);
  });
});

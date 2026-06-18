import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type BenchmarkHandlers } from './handlers.js';
import type { BenchmarkResearcher } from './researcher.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

const fakeResearcher: BenchmarkResearcher = {
  research: async () => ({
    avgGPAAdmitted: 3.8,
    avgTEASScore: 85,
    typicalClinicalHours: 40,
    typicalVolunteerHours: 40,
    typicalCertifications: ['CNA'],
    competitiveEdges: ['leadership'],
  }),
  analyzeGaps: async () => ({
    summary: 'Focus on clinical hours.',
    gaps: [{ metric: 'clinical', severity: 'high', recommendation: 'Add 20 hours' }],
  }),
};

const downResearcher: BenchmarkResearcher = {
  research: () => Promise.reject(Object.assign(new Error('down'), { status: 503 })),
  analyzeGaps: () => Promise.reject(Object.assign(new Error('down'), { status: 503 })),
};

let data: Data;
let h: BenchmarkHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => fakeResearcher);
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

describe('detail (GET /colleges/:id/benchmark)', () => {
  it('404s when the college does not exist', async () => {
    await expectStatus(h.detail(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('returns a null benchmark + insufficient-data comparison when none has been researched', async () => {
    const id = await seedCollege();
    const res = await h.detail(ctx({ params: { id } }));
    expect(res.status).toBe(200);
    const body = res.body as { benchmark: unknown; comparison: { overallReadiness: string } };
    expect(body.benchmark).toBeNull();
    expect(body.comparison.overallReadiness).toBe('insufficient-data');
  });

  it('returns the stored benchmark with a freshly-computed comparison', async () => {
    const id = await seedCollege();
    await data.benchmarks.put(id, {
      avgGPAAdmitted: 3.8,
      avgTEASScore: 85,
      typicalClinicalHours: 40,
      typicalVolunteerHours: 40,
    });
    await data.courses.create({ name: 'AP Bio', gradePoints: 4.0, units: 1 } as Parameters<Data['courses']['create']>[0]);
    await data.experiences.create({ date: '2026-01-01', facility: 'Hoag', hours: 60, visibility: 'family' } as Parameters<Data['experiences']['create']>[0]);

    const res = await h.detail(ctx({ params: { id } }));
    const body = res.body as { comparison: { gpaStatus: string; clinicalHoursStatus: string } };
    expect(body.comparison.gpaStatus).toBe('above');
    expect(body.comparison.clinicalHoursStatus).toBe('above');
  });

  it('falls back to the onboarding GPA when no courses are entered', async () => {
    const id = await seedCollege();
    await data.studentProfile.put({ currentGPA: 3.4 } as Parameters<Data['studentProfile']['put']>[0]);
    const res = await h.detail(ctx({ params: { id } }));
    expect((res.body as { keira: { gpa?: number } }).keira.gpa).toBe(3.4);
  });

  it('prefers a real course GPA over the onboarding GPA', async () => {
    const id = await seedCollege();
    await data.studentProfile.put({ currentGPA: 3.4 } as Parameters<Data['studentProfile']['put']>[0]);
    await data.courses.create({ name: 'AP Bio', grade: 'A' } as Parameters<Data['courses']['create']>[0]);
    const res = await h.detail(ctx({ params: { id } }));
    expect((res.body as { keira: { gpa?: number } }).keira.gpa).toBe(4.0);
  });
});

describe('refresh (POST /colleges/:id/benchmark/refresh)', () => {
  it('researches, persists the merged benchmark, and returns the comparison', async () => {
    const id = await seedCollege();
    const res = await h.refresh(ctx({ params: { id }, body: {} }));
    expect(res.status).toBe(200);
    const body = res.body as { benchmark: { avgGPAAdmitted: number; keirasComparison?: unknown } };
    expect(body.benchmark.avgGPAAdmitted).toBe(3.8);
    // Persisted, and carries the computed comparison.
    const stored = await data.benchmarks.get(id);
    expect(stored?.avgGPAAdmitted).toBe(3.8);
    expect(stored?.keirasComparison).toBeDefined();
  });

  it('stamps lastDataRefresh and stores the researched fields', async () => {
    const id = await seedCollege();
    await h.refresh(ctx({ params: { id }, body: { focus: 'direct-admit BSN' } }));
    const stored = await data.benchmarks.get(id);
    expect(stored?.typicalClinicalHours).toBe(40);
    expect(stored?.typicalCertifications).toEqual(['CNA']);
    expect(stored?.lastDataRefresh).toBeTruthy();
  });

  it('404s when the college does not exist', async () => {
    await expectStatus(h.refresh(ctx({ params: { id: 'ghost' }, body: {} })), 404);
  });

  it('422s on an unknown body field', async () => {
    const id = await seedCollege();
    await expectStatus(h.refresh(ctx({ params: { id }, body: { bogus: 1 } })), 422);
  });

  it('auto-calculates and persists a 0-100 college fit score from the comparison', async () => {
    const id = await seedCollege();
    await h.refresh(ctx({ params: { id }, body: {} }));
    const college = await data.colleges.get(id);
    expect(typeof college?.fitScore).toBe('number');
    expect(college!.fitScore!).toBeGreaterThanOrEqual(0);
    expect(college!.fitScore!).toBeLessThanOrEqual(100);
  });

  it('marks the benchmark failed (not a thrown error) when AI research is unavailable', async () => {
    // Refresh is async now: the request is accepted (200) and hands off to the worker; a research
    // failure surfaces as hydrationStatus 'failed' on the benchmark, which the UI polls for. (With no
    // queue configured the dispatcher runs the research inline, so the 'failed' write lands here.)
    const hh = makeHandlers(() => data, () => downResearcher);
    const id = await seedCollege();
    const res = await hh.refresh(ctx({ params: { id }, body: {} }));
    expect(res.status).toBe(200);
    expect((await data.benchmarks.get(id))?.hydrationStatus).toBe('failed');
  });
});

describe('aggregate (GET /benchmarks/aggregate)', () => {
  it('returns a row per college with Keira stats echoed', async () => {
    const a = await seedCollege('UCLA');
    await seedCollege('CSULB');
    await data.benchmarks.put(a, { avgGPAAdmitted: 3.8, typicalClinicalHours: 40 });
    const res = await h.aggregate(ctx());
    const body = res.body as { keira: unknown; rows: unknown[] };
    expect(body.rows).toHaveLength(2);
    expect(body.keira).toBeDefined();
  });

  it('records one monthly snapshot and returns the trend; re-loading the same month does not duplicate', async () => {
    const a = await seedCollege('UCLA');
    await data.benchmarks.put(a, { avgGPAAdmitted: 3.8, typicalClinicalHours: 40 });
    const first = (await h.aggregate(ctx())).body as { trend: { month: string }[] };
    expect(first.trend).toHaveLength(1);
    expect(first.trend[0]?.month).toMatch(/^\d{4}-\d{2}$/);
    const second = (await h.aggregate(ctx())).body as { trend: unknown[] };
    expect(second.trend).toHaveLength(1); // same calendar month → replaced, not appended
    expect((await data.benchmarkHistory.get())?.snapshots).toHaveLength(1);
  });

  it('does not record a snapshot when no college has benchmark data yet', async () => {
    await seedCollege('UCLA'); // no benchmark put
    const res = (await h.aggregate(ctx())).body as { trend: unknown[] };
    expect(res.trend).toHaveLength(0);
    expect(await data.benchmarkHistory.get()).toBeNull();
  });
});

describe('gaps (GET /benchmarks/gaps)', () => {
  it('returns the AI gaps analysis', async () => {
    await seedCollege();
    const res = await h.gaps(ctx());
    const body = res.body as { summary: string; gaps: unknown[] };
    expect(body.summary).toContain('clinical');
    expect(body.gaps).toHaveLength(1);
  });

  it('propagates a 503 when AI analysis is unavailable', async () => {
    const hh = makeHandlers(() => data, () => downResearcher);
    await expectStatus(hh.gaps(ctx()), 503);
  });
});

describe('privacy — a parent never has private-entry hours folded into Keira’s stats', () => {
  beforeEach(async () => {
    await data.experiences.create({ date: '2026-01-01', facility: 'Hoag', hours: 5, visibility: 'family' } as Parameters<Data['experiences']['create']>[0]);
    await data.experiences.create({ date: '2026-01-02', facility: 'Private', hours: 10, visibility: 'private' } as Parameters<Data['experiences']['create']>[0]);
    await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'CHOC', hours: 8, visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
    await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'volunteer', title: 'Secret', hours: 12, visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  });

  it('Keira’s aggregate includes private hours', async () => {
    const res = await h.aggregate(ctx({ requester: keira }));
    const stats = (res.body as { keira: { clinicalHours: number; volunteerHours: number } }).keira;
    expect(stats.clinicalHours).toBe(15);
    expect(stats.volunteerHours).toBe(20);
  });

  it('a parent’s view EXCLUDES private hours', async () => {
    const res = await h.aggregate(ctx({ requester: kate }));
    const stats = (res.body as { keira: { clinicalHours: number; volunteerHours: number } }).keira;
    expect(stats.clinicalHours).toBe(5);
    expect(stats.volunteerHours).toBe(8);
  });

  it('the detail endpoint also excludes private hours for a parent', async () => {
    const id = await seedCollege();
    const res = await h.detail(ctx({ params: { id }, requester: kate }));
    const stats = (res.body as { keira: { clinicalHours: number; volunteerHours: number } }).keira;
    expect(stats.clinicalHours).toBe(5);
    expect(stats.volunteerHours).toBe(8);
  });

  it('the gaps endpoint also excludes private hours for a parent', async () => {
    await seedCollege();
    const res = await h.gaps(ctx({ requester: kate }));
    const stats = (res.body as { keira: { clinicalHours: number } }).keira;
    expect(stats.clinicalHours).toBe(5);
  });

  it('the PERSISTED trend snapshot excludes private hours even when Keira triggers it', async () => {
    const a = await seedCollege('UCLA');
    await data.benchmarks.put(a, { avgGPAAdmitted: 3.8, typicalClinicalHours: 40 });
    // Keira (owner) loads the dashboard — her live view includes private hours, but the family-visible
    // snapshot written to history must not, since a parent can later read that trend.
    const res = (await h.aggregate(ctx({ requester: keira }))).body as { keira: { clinicalHours: number }; trend: { clinicalHours: number; volunteerHours: number }[] };
    expect(res.keira.clinicalHours).toBe(15); // live view (owner) includes private
    expect(res.trend[0]?.clinicalHours).toBe(5); // persisted snapshot is family-visible only
    expect(res.trend[0]?.volunteerHours).toBe(8);
  });
});

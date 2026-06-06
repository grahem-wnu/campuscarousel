import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type CourseHandlers } from './handlers.js';
import type { GpaResult } from './gpa.js';
import type { PrereqReport } from './prerequisites.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let h: CourseHandlers;

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

async function seed(over: Record<string, unknown> = {}): Promise<string> {
  const c = await data.courses.create({ name: 'Course', ...over } as Parameters<Data['courses']['create']>[0]);
  return c.courseId;
}

const expectStatus = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status });

describe('create (POST /courses)', () => {
  it('creates a course (any family member may log)', async () => {
    const res = await h.create(ctx({ requester: kate, body: { name: 'AP Biology', type: 'AP', subject: 'science' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'AP Biology', type: 'AP' });
  });

  it('422s on invalid input (missing name, bad enum, unknown field)', async () => {
    await expectStatus(h.create(ctx({ body: { type: 'AP' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'X', type: 'nope' } })), 422);
    await expectStatus(h.create(ctx({ body: { name: 'X', bogus: 1 } })), 422);
  });
});

describe('list (GET /courses)', () => {
  beforeEach(async () => {
    await seed({ name: 'Algebra II', subject: 'math', year: 'sophomore' });
    await seed({ name: 'AP Bio', subject: 'science', year: 'junior' });
    await seed({ name: 'US History', subject: 'social-studies', year: 'junior' });
  });

  it('returns all courses', async () => {
    const res = await h.list(ctx());
    expect((res.body as { courses: unknown[] }).courses).toHaveLength(3);
  });

  it('filters by year', async () => {
    const res = await h.list(ctx({ query: { year: 'junior' } }));
    expect((res.body as { courses: unknown[] }).courses).toHaveLength(2);
  });

  it('filters by subject', async () => {
    const res = await h.list(ctx({ query: { subject: 'math' } }));
    const items = (res.body as { courses: { name: string }[] }).courses;
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Algebra II');
  });

  it('composes year + subject', async () => {
    const res = await h.list(ctx({ query: { year: 'junior', subject: 'science' } }));
    expect((res.body as { courses: unknown[] }).courses).toHaveLength(1);
  });
});

describe('update / remove', () => {
  it('adds a final grade via PUT', async () => {
    const id = await seed({ name: 'Chem', grade: undefined });
    const res = await h.update(ctx({ params: { id }, body: { grade: 'A' } }));
    expect(res.status).toBe(200);
    expect((res.body as { grade: string }).grade).toBe('A');
  });

  it('404 on update/delete of a missing course', async () => {
    await expectStatus(h.update(ctx({ params: { id: 'ghost' }, body: { grade: 'A' } })), 404);
    await expectStatus(h.remove(ctx({ params: { id: 'ghost' } })), 404);
  });

  it('deletes a course (204)', async () => {
    const id = await seed();
    const res = await h.remove(ctx({ params: { id } }));
    expect(res.status).toBe(204);
    expect(await data.courses.get(id)).toBeNull();
  });
});

describe('gpa (GET /courses/gpa)', () => {
  it('computes weighted + unweighted over graded courses', async () => {
    await seed({ name: 'AP Bio', type: 'AP', grade: 'A', units: 1 });
    await seed({ name: 'English', type: 'regular', grade: 'B', units: 1 });
    await seed({ name: 'Planned', grade: undefined, units: 5 }); // ignored
    const res = await h.gpa(ctx());
    const g = res.body as GpaResult;
    expect(g.unweighted).toBe(3.5); // (4.0 + 3.0) / 2
    expect(g.weighted).toBe(4.0); // (5.0 + 3.0) / 2
    expect(g.gradedCount).toBe(2);
  });
});

describe('prerequisites (GET /courses/prerequisites/:collegeId)', () => {
  it('404s when the college does not exist', async () => {
    await expectStatus(h.prerequisites(ctx({ params: { collegeId: 'ghost' } })), 404);
  });

  it('reports satisfaction + gaps for a real college', async () => {
    const college = await data.colleges.create({
      name: 'UC Irvine',
      prerequisites: ['Anatomy', 'Microbiology'],
    } as Parameters<Data['colleges']['create']>[0]);
    await seed({ name: 'Anatomy & Physiology', satisfiesPrereq: [{ collegeId: college.collegeId, prereqName: 'Anatomy' }] });

    const res = await h.prerequisites(ctx({ params: { collegeId: college.collegeId } }));
    const report = res.body as PrereqReport;
    expect(report.collegeName).toBe('UC Irvine');
    expect(report.satisfiedCount).toBe(1);
    expect(report.totalCount).toBe(2);
    expect(report.gaps).toEqual(['Microbiology']);
  });
});

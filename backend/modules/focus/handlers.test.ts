import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type FocusHandlers } from './handlers.js';
import { makeOverviewWorkerHandler, runOverviewJob } from './overview.js';
import { makeCareerWorkerHandler, runCareerPathJob } from './careerpath.js';
import { type FocusOverviewer } from './ai.js';

const keira: Requester = { username: 'keira', role: 'student' };

let data: Data;
const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

// Stub generators so no network/Bedrock is touched; the inline dispatchers run them.
const stubOverview: FocusOverviewer = async () => ({
  overview: '## Nursing\nYou will study anatomy and clinicals.',
  sources: [{ title: 'BLS Nursing Outlook', url: 'https://bls.gov/nursing' }],
});
const stubCareer: FocusOverviewer = async () => ({
  overview: '## Path to ICU Nurse\nBSN then NCLEX then ICU residency.',
  sources: [{ title: 'BLS RN', url: 'https://bls.gov/rn' }],
});

/** Handlers whose dispatchers run the jobs inline with the stub generators (no queue, no network). */
function makeFocus(overviewer: FocusOverviewer = stubOverview, career: FocusOverviewer = stubCareer): FocusHandlers {
  return makeHandlers({
    getData: () => data,
    overviewDispatch: () => runOverviewJob(() => data, overviewer),
    careerDispatch: () => runCareerPathJob(() => data, career),
  });
}

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

describe('GET /focus', () => {
  it('no major set → empty packs, no overview, not stale', async () => {
    const res = await makeFocus().get(ctx());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ majors: [], packs: [], overview: null, stale: false });
  });

  it('resolves the nursing pack (TEAS exam, label) from intendedMajors', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'], careerGoal: 'ICU Nurse' });
    const res = await makeFocus().get(ctx());
    const body = res.body as { packs: { key: string; label: string; entranceExam?: { examName: string } }[]; careerGoal: string };
    expect(body.packs).toHaveLength(1);
    expect(body.packs[0]).toMatchObject({ key: 'nursing', label: 'Nursing (BSN)' });
    expect(body.packs[0]!.entranceExam?.examName).toBe('TEAS');
    expect(body.careerGoal).toBe('ICU Nurse');
  });
});

describe('POST /focus/overview', () => {
  it('generates + caches the overview (inline fallback), returns it complete', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    const res = await makeFocus().refresh(ctx());
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'complete', generatedFor: ['Nursing'] });
    const got = await makeFocus().get(ctx());
    const body = got.body as { overview: { status: string; overview: string; sources: { url: string }[] } };
    expect(body.overview.status).toBe('complete');
    expect(body.overview.overview).toContain('anatomy');
    expect(body.overview.sources[0]!.url).toBe('https://bls.gov/nursing');
  });

  it('records failed status when the overviewer throws', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    const boom: FocusOverviewer = async () => {
      throw new Error('bedrock down');
    };
    await makeFocus(boom).refresh(ctx());
    const overview = await data.focusOverview.get();
    expect(overview).toMatchObject({ status: 'failed', error: 'bedrock down' });
  });

  it('marks a cached overview stale once the major changes', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    await makeFocus().refresh(ctx());
    await data.studentProfile.put({ intendedMajors: ['Business'] });
    const res = await makeFocus().get(ctx());
    expect((res.body as { stale: boolean }).stale).toBe(true);
  });
});

describe('POST /focus/career-path', () => {
  it('422 when no career goal is set', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    await expect(makeFocus().refreshCareer(ctx())).rejects.toMatchObject({ status: 422 });
  });

  it('generates + caches the career path from the free-text goal', async () => {
    await data.studentProfile.put({ careerGoal: 'Critical Care Nurse / ICU' });
    const res = await makeFocus().refreshCareer(ctx());
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'complete', generatedFor: ['Critical Care Nurse / ICU'] });
    const got = await makeFocus().get(ctx());
    const body = got.body as { careerPath: { status: string; overview: string }; careerStale: boolean };
    expect(body.careerPath.status).toBe('complete');
    expect(body.careerPath.overview).toContain('NCLEX');
    expect(body.careerStale).toBe(false);
  });

  it('marks the career path stale once the career goal changes', async () => {
    await data.studentProfile.put({ careerGoal: 'ICU Nurse' });
    await makeFocus().refreshCareer(ctx());
    await data.studentProfile.put({ careerGoal: 'Pediatric Nurse' });
    const res = await makeFocus().get(ctx());
    expect((res.body as { careerStale: boolean }).careerStale).toBe(true);
  });
});

describe('focus-overview worker handler', () => {
  it('runs on its own message type and ignores others', async () => {
    await data.studentProfile.put({ intendedMajors: ['Nursing'] });
    const handler = makeOverviewWorkerHandler(() => data, stubOverview);
    await handler({ type: 'something-else' });
    expect(await data.focusOverview.get()).toBeNull();
    await handler({ type: 'focus-overview', tenantId: 't', studentId: 's' });
    expect(await data.focusOverview.get()).toMatchObject({ status: 'complete' });
  });
});

describe('career-path worker handler', () => {
  it('runs only on a kind:career message and writes the career-path doc', async () => {
    await data.studentProfile.put({ careerGoal: 'ICU Nurse' });
    const handler = makeCareerWorkerHandler(() => data, stubCareer);
    await handler({ type: 'focus-overview', tenantId: 't', studentId: 's' }); // no kind → ignored
    expect(await data.careerPath.get()).toBeNull();
    await handler({ type: 'focus-overview', kind: 'career', tenantId: 't', studentId: 's' });
    expect(await data.careerPath.get()).toMatchObject({ status: 'complete' });
  });
});

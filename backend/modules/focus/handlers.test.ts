import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type FocusHandlers } from './handlers.js';
import { makeOverviewWorkerHandler, runOverviewJob } from './overview.js';
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

// A stub overviewer so no network/Bedrock is touched; the inline dispatcher runs it.
const stubOverview: FocusOverviewer = async () => ({
  overview: '## Nursing\nYou will study anatomy and clinicals.',
  sources: [{ title: 'BLS Nursing Outlook', url: 'https://bls.gov/nursing' }],
});

/** Handlers whose dispatcher runs the job inline with the stub overviewer (no queue, no network). */
function makeFocus(overviewer: FocusOverviewer = stubOverview): FocusHandlers {
  return makeHandlers({ getData: () => data, overviewDispatch: () => runOverviewJob(() => data, overviewer) });
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

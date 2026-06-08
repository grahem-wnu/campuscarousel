// Integration through the real shared router for the application tracker, recommendation strategy
// board, and test-score tracker. Curated AI fallback (no BEDROCK_MODEL_ID). The privacy-critical
// assertion: the recommender brief is grounded ONLY in family-visible experiences — a private entry
// must never appear in it, even when keira (who CAN see her private entries) is the caller.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const now = () => new Date('2026-06-06T00:00:00Z');
let data: Data;
let dispatch: ReturnType<typeof createRouter>;
let prevModel: string | undefined;

beforeEach(() => {
  prevModel = process.env.BEDROCK_MODEL_ID;
  delete process.env.BEDROCK_MODEL_ID; // curated fallback — never calls AWS
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, now })));
});
afterEach(() => {
  if (prevModel !== undefined) process.env.BEDROCK_MODEL_ID = prevModel;
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {}): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: opts.query,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: { http: { method, path }, authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

describe('application tracker', () => {
  it('401s unauthenticated', async () => {
    expect((await dispatch(event('GET', '/applications'))).statusCode).toBe(401);
  });

  it('creates, lists (deadline-ordered), updates a decision, and deletes', async () => {
    const created = await dispatch(event('POST', '/applications', { as: keira, body: { collegeId: 'uci', deadline: '2026-11-30' } }));
    expect(created.statusCode).toBe(201);
    const app = parse(created) as { applicationId: string; status: string; createdBy: string };
    expect(app.status).toBe('planning'); // defaulted
    expect(app.createdBy).toBe('keira');

    await dispatch(event('POST', '/applications', { as: keira, body: { collegeId: 'csulb', deadline: '2026-10-15' } }));
    const list = parse(await dispatch(event('GET', '/applications', { as: keira }))) as { applications: { collegeId: string }[] };
    expect(list.applications.map((a) => a.collegeId)).toEqual(['csulb', 'uci']); // earlier deadline first

    const upd = await dispatch(event('PUT', `/applications/${app.applicationId}`, { as: keira, body: { decision: 'accepted', components: { essay: 'complete' } } }));
    expect((parse(upd) as { decision: string }).decision).toBe('accepted');

    expect((await dispatch(event('DELETE', `/applications/${app.applicationId}`, { as: keira }))).statusCode).toBe(204);
    expect((await dispatch(event('GET', `/applications/${app.applicationId}`, { as: keira }))).statusCode).toBe(404);
  });

  it('builds a decision matrix from decided applications + college data', async () => {
    await data.colleges.create({ name: 'UC Irvine', estimatedCostAfterAid: 18000, fitScore: 88 } as Parameters<Data['colleges']['create']>[0]);
    const colleges = await data.colleges.list();
    const cid = colleges[0]!.collegeId;
    await dispatch(event('POST', '/applications', { as: keira, body: { collegeId: cid, decision: 'accepted' } }));
    await dispatch(event('POST', '/applications', { as: keira, body: { collegeId: 'other', status: 'planning' } })); // no decision

    const matrix = parse(await dispatch(event('GET', '/applications/decision-matrix', { as: keira }))) as {
      decisions: { collegeId: string; name: string; decision: string }[];
    };
    expect(matrix.decisions).toHaveLength(1);
    expect(matrix.decisions[0]).toMatchObject({ collegeId: cid, name: 'UC Irvine', decision: 'accepted' });
  });
});

describe('recommendation strategy board', () => {
  it('creates a slot, advances status, and records submitted colleges', async () => {
    const created = await dispatch(event('POST', '/recommendations', { as: keira, body: { slot: 'clinical-supervisor', contactName: 'Nurse Riley' } }));
    expect(created.statusCode).toBe(201);
    const rec = parse(created) as { recommendationId: string; status: string };
    expect(rec.status).toBe('identified'); // defaulted

    const upd = parse(await dispatch(event('PUT', `/recommendations/${rec.recommendationId}`, { as: keira, body: { status: 'submitted', submittedColleges: ['uci'] } }))) as {
      status: string;
      submittedColleges: string[];
    };
    expect(upd.status).toBe('submitted');
    expect(upd.submittedColleges).toEqual(['uci']);
  });

  it('PRIVACY: recommender brief never includes a private entry, even for keira', async () => {
    await data.activities.create({ userId: 'keira', date: '2026-02-01', category: 'volunteer', title: 'Hospital volunteer shift', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
    await data.whyNursing.create({ date: '2026-03-01', title: 'SECRET private reflection', content: 'a private moment', visibility: 'private' } as Parameters<Data['whyNursing']['create']>[0]);

    const rec = parse(await dispatch(event('POST', '/recommendations', { as: keira, body: { slot: 'clinical-supervisor' } }))) as { recommendationId: string };
    const res = await dispatch(event('POST', `/recommendations/${rec.recommendationId}/brief`, { as: keira, body: {} }));
    expect(res.statusCode).toBe(200);
    const body = parse(res) as { brief: { includesPrivate: boolean; suggestedStories: string[] }; recommendation: { aiBrief: string } };

    const blob = JSON.stringify(body);
    expect(body.brief.includesPrivate).toBe(false);
    expect(blob).toContain('Hospital volunteer shift'); // family experience IS used
    expect(blob).not.toContain('SECRET private reflection'); // private title excluded
    expect(blob).not.toContain('a private moment'); // private content excluded
    expect(body.recommendation.aiBrief).not.toContain('SECRET'); // persisted brief is private-free
  });
});

describe('test-score tracker', () => {
  it('creates per-test records, filters by type, and routes scores to colleges via sentTo', async () => {
    const sat = parse(await dispatch(event('POST', '/test-scores', { as: keira, body: { testType: 'SAT', testDate: '2026-05-01', score: 1380, sectionScores: { math: 700, reading: 680 } } }))) as { scoreId: string };
    await dispatch(event('POST', '/test-scores', { as: keira, body: { testType: 'TEAS', testDate: '2026-02-01', score: 88 } }));

    const all = parse(await dispatch(event('GET', '/test-scores', { as: keira }))) as { testScores: { testType: string }[] };
    expect(all.testScores.map((s) => s.testType)).toEqual(['TEAS', 'SAT']); // testDate order

    const filtered = parse(await dispatch(event('GET', '/test-scores', { as: keira, query: { testType: 'SAT' } }))) as { testScores: unknown[] };
    expect(filtered.testScores).toHaveLength(1);

    const routed = parse(await dispatch(event('PUT', `/test-scores/${sat.scoreId}`, { as: keira, body: { sentTo: ['uci', 'csulb'] } }))) as { sentTo: string[] };
    expect(routed.sentTo).toEqual(['uci', 'csulb']);
  });
});

// End-to-end integration through the real shared router: crafted HTTP API v2 events with Cognito JWT
// claims → dispatch → standard envelope. Proves identity resolution + routing (incl. static-beats-
// param for /colleges/discover etc and multi-level params for /colleges/:id/notes) + zod + envelope,
// the way it runs in the Lambda, without AWS. College data is family-visible → the privacy axis here
// is the auth gate (401 without a JWT).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { Discoverer } from './ai.js';

const stubDiscoverer: Discoverer = async () => [{ name: 'Discovered U', state: 'Ohio' }];

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(
    buildRoutes(makeHandlers({ getData: () => data, discoverer: stubDiscoverer, dispatch: async () => {} })),
  );
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role });
function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown; query?: Record<string, string> } = {},
): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: opts.query,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

async function createCollege(name: string): Promise<string> {
  const res = await dispatch(event('POST', '/colleges', { as: keira, body: { name } }));
  return (parse(res) as { collegeId: string }).collegeId;
}

describe('router integration', () => {
  it('401s an unauthenticated request', async () => {
    const res = await dispatch(event('GET', '/colleges'));
    expect(res.statusCode).toBe(401);
  });

  it('404s an unknown path', async () => {
    const res = await dispatch(event('GET', '/nope', { as: keira }));
    expect(res.statusCode).toBe(404);
  });

  it('creates then lists', async () => {
    await createCollege('Ohio State');
    const res = await dispatch(event('GET', '/colleges', { as: keira }));
    expect((parse(res).colleges as unknown[])).toHaveLength(1);
  });

  it('routes /colleges/discover (static beats :id) as an async job, then polls it', async () => {
    // Discovery is async: POST creates a job (here it runs inline via the stub), GET polls it.
    const res = await dispatch(event('POST', '/colleges/discover', { as: keira, body: { state: 'Ohio' } }));
    expect(res.statusCode).toBe(202);
    const jobId = (parse(res) as { jobId: string }).jobId;
    expect(jobId).toBeTruthy();
    expect(parse(res).status).toBe('complete'); // stub ran inline
    expect((parse(res).candidates as { name: string }[])[0]?.name).toBe('Discovered U');

    const poll = await dispatch(event('GET', `/colleges/discover/${jobId}`, { as: keira }));
    expect(poll.statusCode).toBe(200);
    expect((parse(poll).candidates as { name: string }[])[0]?.name).toBe('Discovered U');

    const list = await dispatch(event('GET', '/colleges', { as: keira }));
    expect((parse(list).colleges as unknown[])).toHaveLength(0); // discovery adds nothing
  });

  it('routes /colleges/hydrate-all and /colleges/bulk-add', async () => {
    const bulk = await dispatch(
      event('POST', '/colleges/bulk-add', { as: keira, body: { colleges: [{ name: 'A' }, { name: 'B' }] } }),
    );
    expect(bulk.statusCode).toBe(201);
    const all = await dispatch(event('POST', '/colleges/hydrate-all', { as: keira }));
    expect(all.statusCode).toBe(202);
    expect(parse(all).requested).toBe(2);
  });

  it('routes the multi-level :id sub-resources (top-pick, hydrate, notes, checklist)', async () => {
    const id = await createCollege('Ohio State');

    const tp = await dispatch(event('PATCH', `/colleges/${id}/top-pick`, { as: keira, body: { isTopPick: true } }));
    expect(tp.statusCode).toBe(200);
    expect(parse(tp).isTopPick).toBe(true);

    const hyd = await dispatch(event('POST', `/colleges/${id}/hydrate`, { as: keira }));
    expect(hyd.statusCode).toBe(202);

    const note = await dispatch(event('POST', `/colleges/${id}/notes`, { as: keira, body: { content: 'Visited' } }));
    expect(note.statusCode).toBe(201);
    const notes = await dispatch(event('GET', `/colleges/${id}/notes`, { as: keira }));
    expect((parse(notes).notes as unknown[])).toHaveLength(1);

    const chk = await dispatch(
      event('PUT', `/colleges/${id}/checklist`, { as: keira, body: { items: [{ id: 'a', label: 'Apply', completed: false }] } }),
    );
    expect(chk.statusCode).toBe(200);
  });

  it('updates and soft-deletes by id', async () => {
    const id = await createCollege('Ohio State');
    const put = await dispatch(event('PUT', `/colleges/${id}`, { as: keira, body: { ranking: 'Top 10' } }));
    expect(parse(put).ranking).toBe('Top 10');
    const del = await dispatch(event('DELETE', `/colleges/${id}`, { as: keira }));
    expect(parse(del).status).toBe('removed');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createRouter, Errors, validate, z } from './index.js';
import { maybeStudentId } from '../tenant/index.js';
import type { ApiEvent, ApiResponse } from './event.js';
import type { RouteDef } from './types.js';

// Default caller: a student login pinned to her own roster entry (custom:studentId). The router
// scopes a student to THIS id and ignores any client-supplied X-Student-Id header (see the
// student-pinning tests below).
const KEIRA = {
  'cognito:username': 'keira',
  'custom:role': 'student',
  'custom:tenantId': 'fam1',
  'custom:studentId': 's-keira',
};
const ADMIN = { 'cognito:username': 'grahem', 'custom:role': 'admin', 'custom:tenantId': 'fam1' };
// An adult caller (parent/manager) — adults may switch the active student via X-Student-Id.
const PARENT = { 'cognito:username': 'kate', 'custom:role': 'parent', 'custom:tenantId': 'fam1' };

function event(opts: {
  method?: string;
  path?: string;
  body?: unknown;
  rawBody?: string;
  claims?: Record<string, unknown> | null;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): ApiEvent {
  const { method = 'GET', path = '/', body, rawBody, claims = KEIRA, query, headers } = opts;
  const serializedBody =
    rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : null;
  return {
    rawPath: path,
    body: serializedBody,
    queryStringParameters: query,
    headers,
    requestContext: {
      http: { method, path },
      authorizer: claims ? { jwt: { claims } } : undefined,
    },
  };
}

function parse(res: ApiResponse): { status: number; body: unknown } {
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

// A representative "sample module" wired through the real router.
const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/activities',
    handler: async (ctx) => ({ status: 200, body: { items: [], cat: ctx.query.cat ?? null } }),
  },
  {
    method: 'POST',
    path: '/activities',
    handler: async (ctx) => {
      const input = validate(z.object({ title: z.string().min(1) }), ctx.body);
      return { status: 201, body: { id: 'a1', title: input.title, by: ctx.requester.username } };
    },
  },
  // Static segment must win over the param route below it.
  { method: 'GET', path: '/activities/special', handler: async () => ({ status: 200, body: { special: true } }) },
  { method: 'GET', path: '/activities/:id', handler: async (ctx) => ({ status: 200, body: { id: ctx.params.id } }) },
  { method: 'DELETE', path: '/activities/:id', handler: async () => ({ status: 204, body: undefined }) },
  { method: 'POST', path: '/admin/reset', roles: ['admin'], handler: async () => ({ status: 200, body: { ok: true } }) },
  { method: 'GET', path: '/boom', handler: async () => { throw new Error('kaboom'); } },
  {
    method: 'GET',
    path: '/missing',
    handler: async () => {
      const e = new Error('Activity not found: x');
      e.name = 'NotFoundError'; // simulate the data layer's NotFoundError
      throw e;
    },
  },
  { method: 'GET', path: '/forbidden', handler: async () => { throw Errors.forbidden('nope'); } },
  // Echoes the active student resolved into the AsyncLocalStorage context (multi-student).
  { method: 'GET', path: '/whoami', handler: async () => ({ status: 200, body: { student: maybeStudentId() ?? null } }) },
];

const dispatch = createRouter(routes);

describe('createRouter', () => {
  it('dispatches a GET and exposes the query string', async () => {
    const res = parse(await dispatch(event({ method: 'GET', path: '/activities', query: { cat: 'service' } })));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], cat: 'service' });
  });

  it('parses the JSON body and passes the requester to the handler', async () => {
    const res = parse(await dispatch(event({ method: 'POST', path: '/activities', body: { title: 'Read' } })));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'a1', title: 'Read', by: 'keira' });
  });

  it('returns a 422 validation envelope when the body fails the schema', async () => {
    const res = parse(await dispatch(event({ method: 'POST', path: '/activities', body: {} })));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'validation' } });
  });

  it('returns 422 when the body is not valid JSON', async () => {
    const res = parse(await dispatch(event({ method: 'POST', path: '/activities', rawBody: '{not json' })));
    expect(res.status).toBe(422);
    expect((res.body as { error: { message: string } }).error.message).toMatch(/not valid JSON/);
  });

  it('prefers a static segment over a param segment', async () => {
    const res = parse(await dispatch(event({ path: '/activities/special' })));
    expect(res.body).toEqual({ special: true });
  });

  it('captures path parameters', async () => {
    const res = parse(await dispatch(event({ path: '/activities/123' })));
    expect(res.body).toEqual({ id: '123' });
  });

  it('returns an empty 204 body for no-content results', async () => {
    const res = await dispatch(event({ method: 'DELETE', path: '/activities/123' }));
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  it('404s an unknown path', async () => {
    const res = parse(await dispatch(event({ path: '/nope' })));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'not_found' } });
  });

  it('404s a known path with the wrong method', async () => {
    const res = parse(await dispatch(event({ method: 'PUT', path: '/activities' })));
    expect(res.status).toBe(404);
    expect((res.body as { error: { message: string } }).error.message).toMatch(/not allowed/);
  });

  it('401s when no JWT claims are present', async () => {
    const res = parse(await dispatch(event({ path: '/activities', claims: null })));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('401s when the JWT carries no tenant claim (SaaS isolation, fail closed)', async () => {
    const noTenant = { 'cognito:username': 'keira', 'custom:role': 'student' };
    const res = parse(await dispatch(event({ path: '/activities', claims: noTenant })));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('enforces route role guards (403 for the wrong role)', async () => {
    const denied = parse(await dispatch(event({ method: 'POST', path: '/admin/reset', claims: KEIRA })));
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: 'forbidden' } });

    const allowed = parse(await dispatch(event({ method: 'POST', path: '/admin/reset', claims: ADMIN })));
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ ok: true });
  });

  it('maps the data layer NotFoundError to a 404 envelope', async () => {
    const res = parse(await dispatch(event({ path: '/missing' })));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'not_found', message: 'Activity not found: x' } });
  });

  it('maps a thrown ApiError to its envelope', async () => {
    const res = parse(await dispatch(event({ path: '/forbidden' })));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'forbidden', message: 'nope' } });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    // The router logs the real error; silence it here so the test output stays clean.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = parse(await dispatch(event({ path: '/boom' })));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error' } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('lets an adult (parent) set the active student from the X-Student-Id header (multi-student)', async () => {
    const res = parse(await dispatch(event({ path: '/whoami', claims: PARENT, headers: { 'X-Student-Id': 's-keira' } })));
    expect(res.body).toEqual({ student: 's-keira' });
  });

  it('reads the X-Student-Id header case-insensitively (adult caller)', async () => {
    const res = parse(await dispatch(event({ path: '/whoami', claims: PARENT, headers: { 'x-student-id': 's-milo' } })));
    expect(res.body).toEqual({ student: 's-milo' });
  });

  it('leaves the active student unset when an adult sends no header and no DEFAULT_STUDENT_ID', async () => {
    const prev = process.env.DEFAULT_STUDENT_ID;
    delete process.env.DEFAULT_STUDENT_ID;
    const res = parse(await dispatch(event({ path: '/whoami', claims: PARENT })));
    expect(res.body).toEqual({ student: null });
    if (prev !== undefined) process.env.DEFAULT_STUDENT_ID = prev;
  });

  it('falls back to DEFAULT_STUDENT_ID for an adult when the header is absent (transition compatibility)', async () => {
    const prev = process.env.DEFAULT_STUDENT_ID;
    process.env.DEFAULT_STUDENT_ID = 's-default';
    const res = parse(await dispatch(event({ path: '/whoami', claims: PARENT })));
    expect(res.body).toEqual({ student: 's-default' });
    if (prev === undefined) delete process.env.DEFAULT_STUDENT_ID;
    else process.env.DEFAULT_STUDENT_ID = prev;
  });

  // SECURITY: a student login is confined to her OWN roster entry. The router pins the active
  // student to the requester's custom:studentId and IGNORES the client-supplied X-Student-Id —
  // this is what stops a student from reading a sibling's data.
  it('pins a student to their own studentId and ignores a spoofed X-Student-Id header (SECURITY)', async () => {
    const STUDENT_S1 = {
      'cognito:username': 'keira',
      'custom:role': 'student',
      'custom:tenantId': 'fam1',
      'custom:studentId': 's1',
    };
    const res = parse(
      await dispatch(event({ path: '/whoami', claims: STUDENT_S1, headers: { 'x-student-id': 's2' } })),
    );
    // Runs under s1 (the student's own pinned scope), NOT s2 from the header.
    expect(res.body).toEqual({ student: 's1' });
  });

  it('401s a student login that is not bound to a roster entry (no studentId)', async () => {
    const UNBOUND = { 'cognito:username': 'keira', 'custom:role': 'student', 'custom:tenantId': 'fam1' };
    const res = parse(await dispatch(event({ path: '/whoami', claims: UNBOUND })));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('lets a view-only member read (GET) but refuses any mutation (403)', async () => {
    const MEMBER = { 'cognito:username': 'grandma', 'custom:role': 'member', 'custom:tenantId': 'fam1' };
    const read = parse(await dispatch(event({ method: 'GET', path: '/activities', claims: MEMBER })));
    expect(read.status).toBe(200);
    const write = parse(await dispatch(event({ method: 'POST', path: '/activities', claims: MEMBER, body: { title: 'x' } })));
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({ error: { code: 'forbidden' } });
    const del = await dispatch(event({ method: 'DELETE', path: '/activities/1', claims: MEMBER }));
    expect(del.statusCode).toBe(403);
  });

  it('throws when two routes share method+path', () => {
    expect(() =>
      createRouter([
        { method: 'GET', path: '/x', handler: async () => ({ status: 200, body: null }) },
        { method: 'GET', path: '/x', handler: async () => ({ status: 200, body: null }) },
      ]),
    ).toThrow(/Duplicate route/);
  });
});

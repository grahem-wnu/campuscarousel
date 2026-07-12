// The router: turns a flat list of route definitions into a single dispatch function for the
// HTTP API's $default route. One Lambda self-routes by method + path (with `:param`/`{param}`
// path params), resolves identity from the JWT, runs optional role guards, parses+passes the
// body, and translates any thrown error into the standard envelope.

import { getRequester, requireRole } from '../auth/index.js';
import { runWithStudent, runWithTenant } from '../tenant/index.js';
import { Errors } from './errors.js';
import { json, responseForError } from './respond.js';
import type { ApiEvent, ApiResponse, LambdaHandler } from './event.js';
import type { HandlerContext, RouteDef } from './types.js';

interface Segment {
  /** Literal text for a static segment. */
  literal?: string;
  /** Parameter name for a `:name` / `{name}` segment. */
  param?: string;
}

interface CompiledRoute {
  method: string;
  segments: Segment[];
  /** Count of static segments — higher wins, so static routes beat param routes. */
  specificity: number;
  route: RouteDef;
}

/** Methods that mutate state — refused for view-only members (see the role guard in dispatch). */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function compile(route: RouteDef): CompiledRoute {
  const segments: Segment[] = splitPath(route.path).map((seg) => {
    if (seg.startsWith(':')) return { param: seg.slice(1) };
    if (seg.startsWith('{') && seg.endsWith('}')) return { param: seg.slice(1, -1) };
    return { literal: seg };
  });
  const specificity = segments.filter((s) => s.literal !== undefined).length;
  return { method: route.method.toUpperCase(), segments, specificity, route };
}

/** Match a compiled route against the request path segments; return captured params or null. */
function matchSegments(compiled: CompiledRoute, pathSegs: string[]): Record<string, string> | null {
  if (compiled.segments.length !== pathSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < compiled.segments.length; i++) {
    const seg = compiled.segments[i]!;
    const value = pathSegs[i]!;
    if (seg.param !== undefined) {
      params[seg.param] = decodeURIComponent(value);
    } else if (seg.literal !== value) {
      return null;
    }
  }
  return params;
}

/** Case-insensitive header lookup (HTTP API usually lowercases keys, but don't rely on it). */
function readHeader(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function normalizeRecord(input?: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Parse the request body as JSON. Empty → undefined. Invalid JSON → 422 validation error. */
function parseBody(event: ApiEvent): unknown {
  if (event.body === undefined || event.body === null || event.body === '') return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw Errors.validation('Request body is not valid JSON');
  }
}

/**
 * Build a dispatch function from route definitions. Routes are compiled once and sorted so more
 * specific (static) paths win over parameterized ones. Throws if two routes share method+path
 * (the same guarantee `check:routes` enforces at build time — this is the runtime backstop).
 */
export function createRouter(routes: RouteDef[]): LambdaHandler {
  const seen = new Set<string>();
  for (const r of routes) {
    const key = `${r.method.toUpperCase()} ${r.path}`;
    if (seen.has(key)) throw new Error(`Duplicate route: ${key}`);
    seen.add(key);
  }

  const compiled = routes.map(compile).sort((a, b) => b.specificity - a.specificity);

  return async function dispatch(event: ApiEvent): Promise<ApiResponse> {
    const method = (event.requestContext?.http?.method ?? 'GET').toUpperCase();
    const rawPath = event.rawPath ?? event.requestContext?.http?.path ?? '/';
    const pathOnly = rawPath.split('?')[0] ?? '/';
    const pathSegs = splitPath(pathOnly);

    let matched: { route: RouteDef; params: Record<string, string> } | undefined;
    let pathExists = false;
    for (const c of compiled) {
      const params = matchSegments(c, pathSegs);
      if (params === null) continue;
      pathExists = true;
      if (c.method === method) {
        matched = { route: c.route, params };
        break;
      }
    }

    if (!matched) {
      // Path matched another method → 405-ish, but the envelope has no 405 code; use not_found
      // for a truly unknown path and validation/forbidden semantics elsewhere. Keep it simple:
      // unknown path or method → 404 not_found.
      const message = pathExists
        ? `Method ${method} not allowed for ${pathOnly}`
        : `No route for ${method} ${pathOnly}`;
      return json(404, { error: { code: 'not_found', message } });
    }

    try {
      const requester = getRequester(event);
      if (matched.route.roles && matched.route.roles.length > 0) {
        requireRole(...matched.route.roles)(requester);
      }
      if (matched.route.platformAdmin && !requester.platformAdmin) {
        throw Errors.forbidden('Requires platform admin');
      }
      // View-only members (grandparents, counselors, family friends — JWT role 'member') can read the
      // family's journey but never change it. Enforced once here so the 24 CRUD modules need no edits:
      // any mutating method is refused for a member. Reads (GET/HEAD) pass through.
      if (requester.role === 'member' && MUTATING_METHODS.has(method)) {
        throw Errors.forbidden('Your access is view-only');
      }
      // SaaS isolation: every request must carry a tenant (or be a platform-admin route). The handler
      // runs inside the tenant's AsyncLocalStorage context so the data layer scopes all keys to it.
      // Transition compatibility: a request with no tenant claim falls back to DEFAULT_TENANT_ID when
      // set (the legacy single-family migration tenant), so existing users keep working before their
      // tokens carry a tenant. With the env unset, a missing claim is rejected (strict / fail closed).
      const tenantId =
        requester.tenantId ?? (requester.platformAdmin ? undefined : process.env.DEFAULT_TENANT_ID);
      if (!tenantId && !requester.platformAdmin) {
        throw Errors.unauthorized('Missing tenant claim');
      }
      // Multi-student: per-child data is scoped to the active student the frontend selects, sent as the
      // `X-Student-Id` header. The router nests `runWithStudent` inside the tenant context so per-child
      // repos resolve `S#<studentId>#`. Family-level handlers (the roster, reminders) ignore it. A
      // request with no header falls back to DEFAULT_STUDENT_ID (the legacy single-child migration id)
      // for transition compatibility; with the env unset, per-child repos fail closed if none is set.
      const studentId =
        readHeader(event.headers, 'x-student-id') ?? process.env.DEFAULT_STUDENT_ID ?? undefined;
      const ctx: HandlerContext = {
        requester,
        params: matched.params,
        query: normalizeRecord(event.queryStringParameters),
        body: parseBody(event),
      };
      const invoke = () => matched.route.handler(ctx);
      const withStudent = () => (studentId ? runWithStudent(studentId, invoke) : invoke());
      const result = tenantId ? await runWithTenant(tenantId, withStudent) : await invoke();
      return json(result.status, result.body);
    } catch (err) {
      return responseForError(err);
    }
  };
}

/** Alias that reads as the Lambda entry: `export const handler = createLambdaHandler(routes)`. */
export const createLambdaHandler = createRouter;

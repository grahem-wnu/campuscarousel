// Dispatch + gating tests for the public auth Lambda (redeem + signup). The happy paths hit AWS
// and are covered at the module layer (redeem.test.ts / signup.test.ts); here we pin what the
// entry itself owns: path dispatch, the PUBLIC_SIGNUP_ENABLED gate, and error mapping — none of
// which need AWS env.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiEvent } from '../shared/api/index.js';
import { handler } from './redeem.js';

function event(path: string, body: unknown): ApiEvent {
  return {
    rawPath: path,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { http: { method: 'POST', path } },
  };
}

function parse(res: { statusCode: number; body: string }) {
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public auth Lambda dispatch', () => {
  it('403s /auth/signup when PUBLIC_SIGNUP_ENABLED is not "true" (the kill switch)', async () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'false');
    const res = parse(await handler(event('/auth/signup', { email: 'a@b.com', password: 'pw12345678' })));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('validates the signup body (no code field) before touching AWS deps', async () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'true');
    const short = parse(await handler(event('/auth/signup', { email: 'a@b.com', password: 'short' })));
    expect(short.status).toBe(422);
    const withCode = parse(
      await handler(event('/auth/signup', { email: 'a@b.com', password: 'pw12345678', code: 'X' })),
    );
    expect(withCode.status).toBe(422);
  });

  it('leaves /auth/redeem ungated: redeem bodies still validate against redeemSchema', async () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'false');
    // Missing `code` → 422 from redeemSchema, NOT the signup 403: the flag only gates signup.
    const res = parse(await handler(event('/auth/redeem', { email: 'a@b.com', password: 'pw12345678' })));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'validation' } });
  });

  it('422s invalid JSON on either path', async () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'true');
    const res = parse(await handler(event('/auth/signup', '{nope')));
    expect(res.status).toBe(422);
  });
});

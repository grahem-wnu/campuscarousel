// Integration through the real router: platform-admin gating + that admin routes run WITHOUT a tenant
// context (they touch the global invite registry). SES is a fake.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

function event(method: string, path: string, claims?: Record<string, unknown>, body?: unknown): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    requestContext: { http: { method, path }, authorizer: claims ? { jwt: { claims } } : undefined },
  };
}
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;
const adminClaims = { 'cognito:username': 'grahem', 'custom:role': 'admin', 'custom:platformAdmin': 'true' };
const familyClaims = { 'cognito:username': 'kate', 'custom:role': 'parent', 'custom:tenantId': 'fam1' };

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const sent: EmailMessage[] = [];
  const sender: EmailSender = { send: async (m) => void sent.push(m) };
  const dispatch = createRouter(
    buildRoutes(makeHandlers({ getData: () => data, sender, from: 'noreply@x.com', appUrl: 'https://app' })),
  );
  return { dispatch, sent };
}

describe('invites router integration', () => {
  it('401s unauthenticated; 403s a family user (not platform admin)', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/admin/invites'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/admin/invites', familyClaims))).statusCode).toBe(403);
  });

  it('lets the platform admin issue + list invites (no tenant context needed)', async () => {
    const { dispatch, sent } = harness();
    const created = await dispatch(event('POST', '/admin/invites', adminClaims, { email: 'fam@x.com' }));
    expect(created.statusCode).toBe(201);
    expect(sent).toHaveLength(1);

    const list = await dispatch(event('GET', '/admin/invites', adminClaims));
    expect((parse(list).invites as unknown[]).length).toBe(1);
  });
});

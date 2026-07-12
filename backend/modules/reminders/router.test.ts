// Integration through the real shared router: JWT identity + routing + zod + envelope, as in the
// Lambda, without AWS. The email sender is a fake so send-test never reaches SES.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });
function event(
  method: string,
  path: string,
  opts: { as?: Requester; body?: unknown } = {},
): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const sent: EmailMessage[] = [];
  const sender: EmailSender = { send: async (m) => void sent.push(m) };
  const dispatch = createRouter(
    buildRoutes(
      makeHandlers({
        getData: () => data,
        sender,
        from: 'noreply@keirasjourney.com',
        appUrl: 'https://app',
        now: () => new Date('2026-06-15T13:00:00Z'),
      }),
    ),
  );
  return { dispatch, sent };
}

describe('reminders router integration', () => {
  it('401s unauthenticated; 404s unknown', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/reminders/settings'))).statusCode).toBe(401);
    expect((await dispatch(event('GET', '/reminders/nope', { as: keira }))).statusCode).toBe(404);
  });

  it('GET settings returns defaults (any family role); a guardian PUTs; send-test emails via the sender', async () => {
    const { dispatch, sent } = harness();

    // A student may READ the settings (the digest gate runs for them too)...
    const get = await dispatch(event('GET', '/reminders/settings', { as: keira }));
    expect(get.statusCode).toBe(200);
    expect(parse(get).cadence).toBe('weekly');

    // ...but only a guardian (admin/parent) may change them or fire a test send.
    const put = await dispatch(
      event('PUT', '/reminders/settings', {
        as: kate,
        body: { cadence: 'daily', recipients: [{ label: 'Mom', email: 'mom@x.com' }] },
      }),
    );
    expect(put.statusCode).toBe(200);
    expect(parse(put).cadence).toBe('daily');

    const test = await dispatch(
      event('POST', '/reminders/send-test', { as: kate, body: { to: 'kate.cuthbertson@gmail.com' } }),
    );
    expect(test.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('kate.cuthbertson@gmail.com');
  });

  it('a student is confined to their own scope — 403 on the family-level reminder mutations', async () => {
    const { dispatch, sent } = harness();
    const put = await dispatch(
      event('PUT', '/reminders/settings', { as: keira, body: { cadence: 'daily' } }),
    );
    expect(put.statusCode).toBe(403);
    const test = await dispatch(
      event('POST', '/reminders/send-test', { as: keira, body: { to: 'x@y.com' } }),
    );
    expect(test.statusCode).toBe(403);
    // The route guard fires before the body is parsed, so nothing is sent.
    expect(sent).toHaveLength(0);
  });

  it('422s an unknown settings field (for a guardian)', async () => {
    const { dispatch } = harness();
    const res = await dispatch(event('PUT', '/reminders/settings', { as: kate, body: { bogus: true } }));
    expect(res.statusCode).toBe(422);
  });
});

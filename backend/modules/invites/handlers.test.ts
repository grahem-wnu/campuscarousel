import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
import { makeHandlers, type InviteHandlers } from './handlers.js';

const grahem: Requester = { username: 'grahem', role: 'admin', platformAdmin: true };

let data: Data;
let sent: EmailMessage[];
let sender: EmailSender;
let h: InviteHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  sent = [];
  sender = { send: async (m) => void sent.push(m) };
  h = makeHandlers({
    getData: () => data,
    sender,
    from: 'noreply@keirasjourney.com',
    appUrl: 'https://app',
    now: () => new Date('2026-06-10T00:00:00Z'),
  });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: grahem,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

describe('POST /admin/invites', () => {
  it('issues a pending invite and emails the code', async () => {
    const res = await h.create(ctx({ body: { email: 'fam@x.com', familyName: 'Smith' } }));
    expect(res.status).toBe(201);
    const invite = res.body as { code: string; status: string; email: string };
    expect(invite.status).toBe('pending');
    expect(invite.email).toBe('fam@x.com');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('fam@x.com');
    expect(sent[0]?.text).toContain(invite.code);
  });

  it('422 on a bad email', async () => {
    await expect(h.create(ctx({ body: { email: 'not-an-email' } }))).rejects.toMatchObject({ status: 422 });
  });
});

describe('GET /admin/invites + revoke', () => {
  it('lists invites and revokes by code', async () => {
    const created = (await h.create(ctx({ body: { email: 'a@x.com' } }))).body as { code: string };
    expect(((await h.list(ctx())).body as { invites: unknown[] }).invites).toHaveLength(1);

    const revoked = await h.revoke(ctx({ params: { code: created.code } }));
    expect(revoked.body).toMatchObject({ status: 'revoked' });
  });

  it('404 on revoking an unknown code', async () => {
    await expect(h.revoke(ctx({ params: { code: 'ZZZ' } }))).rejects.toMatchObject({ status: 404 });
  });
});

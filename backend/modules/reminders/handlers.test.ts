import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
import { makeHandlers, type ReminderHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let sent: EmailMessage[];
let sender: EmailSender;
let h: ReminderHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  sent = [];
  sender = { send: async (m) => void sent.push(m) };
  h = makeHandlers({
    getData: () => data,
    sender,
    from: 'noreply@keirasjourney.com',
    appUrl: 'https://app',
    now: () => new Date('2026-06-15T13:00:00Z'),
  });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

describe('GET /reminders/settings', () => {
  it('returns defaults when none saved', async () => {
    const res = await h.getSettings(ctx());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, cadence: 'weekly', recipients: [] });
  });
});

describe('PUT /reminders/settings', () => {
  it('persists a patch and records updatedBy', async () => {
    const res = await h.putSettings(
      ctx({
        requester: kate,
        body: { cadence: 'daily', recipients: [{ label: 'Mom', email: 'mom@x.com', includePrivate: true }] },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cadence: 'daily', updatedBy: 'kate' });
    const stored = await data.reminderSettings.get();
    expect(stored?.recipients[0]).toMatchObject({ email: 'mom@x.com', includePrivate: true });
  });

  it('422 on an unknown field', async () => {
    await expect(h.putSettings(ctx({ body: { nope: 1 } }))).rejects.toMatchObject({ status: 422 });
  });
});

describe('POST /reminders/send-test', () => {
  it('sends a test to an ad-hoc address', async () => {
    const res = await h.sendTest(ctx({ body: { to: 'kate.cuthbertson@gmail.com' } }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('kate.cuthbertson@gmail.com');
    expect(sent[0]?.subject).toContain('[Test]');
  });

  it('sends to all configured recipients when no address is given', async () => {
    await data.reminderSettings.put({
      enabled: true,
      cadence: 'weekly',
      sendHourUTC: 13,
      weeklyDayOfWeek: 1,
      horizonDays: 30,
      recipients: [
        { label: 'Mom', email: 'm@x.com', includePrivate: false },
        { label: 'Dad', email: 'd@x.com', includePrivate: false },
      ],
    });
    const res = await h.sendTest(ctx({ body: {} }));
    expect((res.body as { sent: number }).sent).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(['d@x.com', 'm@x.com']);
  });

  it('409 when no recipients and no address', async () => {
    await expect(h.sendTest(ctx({ body: {} }))).rejects.toMatchObject({ status: 409 });
  });

  it('409 when the sender email is unconfigured', async () => {
    const h2 = makeHandlers({
      getData: () => data,
      sender,
      from: '',
      appUrl: 'https://app',
      now: () => new Date('2026-06-15T13:00:00Z'),
    });
    await expect(h2.sendTest(ctx({ body: { to: 'x@y.com' } }))).rejects.toMatchObject({ status: 409 });
  });
});

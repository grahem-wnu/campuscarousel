import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { EmailMessage, EmailSender } from '../../shared/email/index.js';
import { runScheduledDigest } from './run.js';

let data: Data;
let sent: EmailMessage[];
let sender: EmailSender;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  sent = [];
  sender = { send: async (m) => void sent.push(m) };
});

const deps = (now: string) => ({ data, sender, from: 'noreply@x.com', appUrl: 'https://app', now: () => new Date(now) });

async function seedActivity(over: Record<string, unknown> = {}): Promise<void> {
  await data.activities.create({
    userId: 'keira',
    date: '2026-06-20',
    category: 'volunteer',
    title: 'Thing',
    visibility: 'family',
    ...over,
  } as Parameters<Data['activities']['create']>[0]);
}

async function settings(over: Record<string, unknown> = {}): Promise<void> {
  await data.reminderSettings.put({
    enabled: true,
    cadence: 'weekly',
    sendHourUTC: 13,
    weeklyDayOfWeek: 1,
    horizonDays: 30,
    recipients: [{ label: 'Mom', email: 'mom@x.com', includePrivate: false }],
    ...over,
  });
}

describe('runScheduledDigest', () => {
  it('skips when no settings are stored', async () => {
    const r = await runScheduledDigest(deps('2026-06-15T13:00:00Z'));
    expect(r.skipped).toBe('no-settings');
  });

  it('skips outside the scheduled hour', async () => {
    await settings();
    await seedActivity();
    const r = await runScheduledDigest(deps('2026-06-15T10:00:00Z'));
    expect(r.skipped).toBe('not-scheduled');
    expect(sent).toHaveLength(0);
  });

  it('emails a recipient with due items and records lastSentAt', async () => {
    await settings();
    await seedActivity();
    const r = await runScheduledDigest(deps('2026-06-15T13:00:00Z'));
    expect(r.sent).toBe(1);
    expect(sent[0]?.to).toBe('mom@x.com');
    expect((await data.reminderSettings.get())?.lastSentAt).toBeTruthy();
  });

  it('does not email a recipient whose digest is empty', async () => {
    await settings(); // nothing due
    const r = await runScheduledDigest(deps('2026-06-15T13:00:00Z'));
    expect(r.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('a parent recipient never receives private-sourced items', async () => {
    await settings();
    await seedActivity({ visibility: 'private', title: 'Private thing' });
    // Mom's only due item is private → her digest is empty → no email.
    const r = await runScheduledDigest(deps('2026-06-15T13:00:00Z'));
    expect(r.sent).toBe(0);
  });

  it('never repeats an item: records notified ids and skips them next week', async () => {
    await settings();
    await seedActivity({ date: '2026-06-20', title: 'One-time thing' });

    const first = await runScheduledDigest(deps('2026-06-15T13:00:00Z')); // Monday
    expect(first.sent).toBe(1);
    expect((await data.reminderSettings.get())?.notifiedEventIds?.length).toBeGreaterThan(0);

    // A week later (the item is now overdue but already notified) → nothing new → no email.
    sent.length = 0;
    const second = await runScheduledDigest(deps('2026-06-22T13:00:00Z')); // next Monday
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

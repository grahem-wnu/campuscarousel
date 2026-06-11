import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type AiHandlers } from './handlers.js';
import type { Assistant, ChatMessage, ContextBundle } from './chat.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let captured: { bundle: ContextBundle; history: ChatMessage[]; message: string }[] = [];

const fakeAssistant: Assistant = {
  reply: async (bundle, history, message) => {
    captured.push({ bundle, history, message });
    return { response: 'Here is some advice.', toolsUsed: ['profile-data'], citations: [] };
  },
};

const downAssistant: Assistant = {
  reply: () => Promise.reject(Object.assign(new Error('down'), { status: 503 })),
};

let data: Data;
let h: AiHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers(() => data, () => fakeAssistant);
  captured = [];
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

const expectStatus = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ status });

async function seedWhy(over: Record<string, unknown> = {}): Promise<void> {
  await data.motivations.create({
    date: '2026-01-10',
    title: 'A moment',
    content: 'Something meaningful.',
    visibility: 'family',
    ...over,
  } as Parameters<Data['motivations']['create']>[0]);
}

describe('chat (POST /ai/chat)', () => {
  it('creates a conversation, persists the user + assistant messages, and returns the reply', async () => {
    const res = await h.chat(ctx({ body: { message: 'How am I doing?' } }));
    expect(res.status).toBe(200);
    const body = res.body as { response: string; conversationId: string; toolsUsed: string[] };
    expect(body.response).toBe('Here is some advice.');
    expect(body.conversationId).toBeTruthy();

    const msgs = await data.conversations.listMessages(body.conversationId);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1]?.toolsUsed).toContain('profile-data');
  });

  it('422s without a message', async () => {
    await expectStatus(h.chat(ctx({ body: {} })), 422);
  });

  it('continues an existing conversation with prior history', async () => {
    const first = await h.chat(ctx({ body: { message: 'first' } }));
    const id = (first.body as { conversationId: string }).conversationId;
    captured = [];
    await h.chat(ctx({ body: { message: 'second', conversationId: id } }));
    // History passed to the model contains the first turn (user + assistant).
    expect(captured[0]?.history.map((m) => m.content)).toEqual(['first', 'Here is some advice.']);
  });

  it('404s when continuing someone else’s conversation', async () => {
    const mine = await h.chat(ctx({ requester: keira, body: { message: 'hi' } }));
    const id = (mine.body as { conversationId: string }).conversationId;
    await expectStatus(h.chat(ctx({ requester: kate, body: { message: 'sneak', conversationId: id } })), 404);
  });

  it('propagates a 503 and writes NOTHING when the assistant is unavailable', async () => {
    const hh = makeHandlers(() => data, () => downAssistant);
    await expectStatus(hh.chat(ctx({ body: { message: 'hi' } })), 503);
    expect(await data.conversations.list()).toHaveLength(0); // no dangling conversation/messages
  });
});

describe('privacy — private entries reach the model ONLY for keira', () => {
  beforeEach(async () => {
    await seedWhy({ title: 'Family moment', visibility: 'family' });
    await seedWhy({ title: 'Private moment', content: 'My secret reason.', visibility: 'private' });
  });

  it('keira’s essay-partner context INCLUDES the private entry', async () => {
    await h.chat(ctx({ requester: keira, body: { message: 'help my essay', context: { mode: 'essay-partner' } } }));
    const texts = captured[0]!.bundle.records.map((r) => r.text).join(' | ');
    expect(texts).toContain('Family moment');
    expect(texts).toContain('Private moment');
  });

  it('a parent’s context EXCLUDES the private entry', async () => {
    await h.chat(ctx({ requester: kate, body: { message: 'help', context: { mode: 'essay-partner' } } }));
    const texts = captured[0]!.bundle.records.map((r) => r.text).join(' | ');
    expect(texts).toContain('Family moment');
    expect(texts).not.toContain('Private moment');
  });

  it('private ACTIVITY hours never reach the model summary for a parent (only for keira)', async () => {
    await data.activities.create({ userId: 'keira', date: '2026-02-01', category: 'volunteer', title: 'Open', hours: 8, visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
    await data.activities.create({ userId: 'keira', date: '2026-02-02', category: 'volunteer', title: 'Hidden', hours: 12, visibility: 'private' } as Parameters<Data['activities']['create']>[0]);

    await h.chat(ctx({ requester: keira, body: { message: 'hours?' } }));
    await h.chat(ctx({ requester: kate, body: { message: 'hours?' } }));
    expect(captured[0]!.bundle.summary.volunteerHours).toBe(20); // keira: family + private
    expect(captured[1]!.bundle.summary.volunteerHours).toBe(8); // parent: family only
  });

  it('private CLINICAL hours never reach the model summary for a parent (only for keira)', async () => {
    await data.experiences.create({ date: '2026-02-01', facility: 'Hoag', hours: 5, visibility: 'family' } as Parameters<Data['experiences']['create']>[0]);
    await data.experiences.create({ date: '2026-02-02', facility: 'Private', hours: 10, visibility: 'private' } as Parameters<Data['experiences']['create']>[0]);

    await h.chat(ctx({ requester: keira, body: { message: 'clinical?' } }));
    await h.chat(ctx({ requester: kate, body: { message: 'clinical?' } }));
    expect(captured[0]!.bundle.summary.clinicalHours).toBe(15); // keira: family + private
    expect(captured[1]!.bundle.summary.clinicalHours).toBe(5); // parent: family only
  });
});

describe('conversations — per-user isolation', () => {
  it('list returns only the caller’s conversations', async () => {
    await h.chat(ctx({ requester: keira, body: { message: 'k1' } }));
    await h.chat(ctx({ requester: kate, body: { message: 'p1' } }));

    const kRes = await h.listConversations(ctx({ requester: keira }));
    const pRes = await h.listConversations(ctx({ requester: kate }));
    expect((kRes.body as { conversations: unknown[] }).conversations).toHaveLength(1);
    expect((pRes.body as { conversations: unknown[] }).conversations).toHaveLength(1);
  });

  it('a parent cannot fetch keira’s conversation by id (404)', async () => {
    const mine = await h.chat(ctx({ requester: keira, body: { message: 'private chat' } }));
    const id = (mine.body as { conversationId: string }).conversationId;

    const ok = await h.getConversation(ctx({ requester: keira, params: { id } }));
    expect(ok.status).toBe(200);
    expect((ok.body as { messages: unknown[] }).messages).toHaveLength(2);

    await expectStatus(h.getConversation(ctx({ requester: kate, params: { id } })), 404);
  });

  it('404s an unknown conversation id', async () => {
    await expectStatus(h.getConversation(ctx({ params: { id: 'ghost' } })), 404);
  });
});

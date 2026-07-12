// End-to-end integration through the real shared router: a crafted HTTP API v2 event with Cognito
// JWT claims → dispatch → standard envelope. Proves routing, JWT identity, zod, the privacy
// ownership check, and the error envelope, without any AWS.

import { beforeEach, describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';
import type { Assistant } from './chat.js';

const fakeAssistant: Assistant = {
  reply: async () => ({ response: 'Hi! Here is some help.', toolsUsed: ['profile-data'], citations: [] }),
};

let data: Data;
let dispatch: ReturnType<typeof createRouter>;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  dispatch = createRouter(buildRoutes(makeHandlers(() => data, () => fakeAssistant)));
});

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant', ...(r.role === 'student' ? { 'custom:studentId': r.studentId ?? 's1' } : {}) });

function event(method: string, path: string, opts: { as?: Requester; body?: unknown } = {}): ApiEvent {
  return {
    rawPath: path,
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

describe('router integration', () => {
  it('rejects an unauthenticated chat with 401', async () => {
    const res = await dispatch(event('POST', '/ai/chat', { body: { message: 'hi' } }));
    expect(res.statusCode).toBe(401);
    expect((parse(res).error as { code: string }).code).toBe('unauthorized');
  });

  it('chats and persists, returning a conversationId', async () => {
    const res = await dispatch(event('POST', '/ai/chat', { as: keira, body: { message: 'How am I doing?' } }));
    expect(res.statusCode).toBe(200);
    const id = parse(res).conversationId as string;
    expect(id).toBeTruthy();

    const list = await dispatch(event('GET', '/ai/conversations', { as: keira }));
    expect((parse(list).conversations as unknown[])).toHaveLength(1);

    const detail = await dispatch(event('GET', `/ai/conversations/${id}`, { as: keira }));
    expect(detail.statusCode).toBe(200);
    expect((parse(detail).messages as unknown[])).toHaveLength(2);
  });

  it('422s a chat without a message', async () => {
    const res = await dispatch(event('POST', '/ai/chat', { as: keira, body: {} }));
    expect(res.statusCode).toBe(422);
  });

  it('a parent gets 404 fetching keira’s conversation by id', async () => {
    const chat = await dispatch(event('POST', '/ai/chat', { as: keira, body: { message: 'secret' } }));
    const id = parse(chat).conversationId as string;
    const res = await dispatch(event('GET', `/ai/conversations/${id}`, { as: kate }));
    expect(res.statusCode).toBe(404);
  });

  it('the conversation list is isolated per user through the real JWT dispatch path', async () => {
    await dispatch(event('POST', '/ai/chat', { as: keira, body: { message: 'keira chat' } }));
    await dispatch(event('POST', '/ai/chat', { as: kate, body: { message: 'kate chat' } }));

    const kList = parse(await dispatch(event('GET', '/ai/conversations', { as: keira }))).conversations as { userId: string }[];
    const pList = parse(await dispatch(event('GET', '/ai/conversations', { as: kate }))).conversations as { userId: string }[];
    expect(kList).toHaveLength(1);
    expect(kList[0]?.userId).toBe('keira');
    expect(pList).toHaveLength(1);
    expect(pList[0]?.userId).toBe('kate');
  });
});

import { describe, expect, it } from 'vitest';
import { canSend, conversationLabel, moduleFromPath, toTurns } from './logic';
import type { Conversation, ConversationMessage } from './types';

const convo = (o: Partial<Conversation>): Conversation =>
  ({ conversationId: 'c', userId: 'keira', createdAt: '', updatedAt: '', ...o }) as Conversation;

describe('moduleFromPath', () => {
  it('returns the first path segment, lowercased', () => {
    expect(moduleFromPath('/why-nursing/123')).toBe('why-nursing');
    expect(moduleFromPath('/College-Hub')).toBe('college-hub');
  });
  it('is undefined at the root', () => {
    expect(moduleFromPath('/')).toBeUndefined();
    expect(moduleFromPath('')).toBeUndefined();
  });
});

describe('conversationLabel', () => {
  it('uses the title when present, truncating long ones', () => {
    expect(conversationLabel(convo({ title: 'Help with my essay' }))).toBe('Help with my essay');
    expect(conversationLabel(convo({ title: 'x'.repeat(80) })).endsWith('…')).toBe(true);
  });
  it('falls back to the context, then a default', () => {
    expect(conversationLabel(convo({ context: 'college-hub' }))).toBe('Chat · college-hub');
    expect(conversationLabel(convo({}))).toBe('Conversation');
  });
});

describe('toTurns', () => {
  it('maps persisted messages to turns preserving role + tools', () => {
    const msgs = [
      { role: 'user', content: 'hi', toolsUsed: undefined },
      { role: 'assistant', content: 'hello', toolsUsed: ['profile-data'] },
    ] as ConversationMessage[];
    expect(toTurns(msgs)).toEqual([
      { role: 'user', content: 'hi', toolsUsed: undefined },
      { role: 'assistant', content: 'hello', toolsUsed: ['profile-data'] },
    ]);
  });
});

describe('canSend', () => {
  it('requires non-empty draft and not sending', () => {
    expect(canSend('hi', false)).toBe(true);
    expect(canSend('   ', false)).toBe(false);
    expect(canSend('hi', true)).toBe(false);
  });
});

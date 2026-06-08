// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { ChatInput, ChatResponse, Conversation, ConversationMessage } from './types';

export function sendChat(input: ChatInput): Promise<ChatResponse> {
  return api.post<ChatResponse>('/ai/chat', input);
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await api.get<{ conversations: Conversation[] }>('/ai/conversations');
  return res.conversations;
}

export function getConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: ConversationMessage[] }> {
  return api.get(`/ai/conversations/${encodeURIComponent(id)}`);
}

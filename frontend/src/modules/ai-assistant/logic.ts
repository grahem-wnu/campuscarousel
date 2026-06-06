// Pure, framework-free helpers for the AI Assistant UI. Unit-tested in logic.test.ts (the repo has
// no jsdom; the logic is what's tested).

import type { Conversation, ConversationMessage, Turn } from './types';

/** Derive the page-context module from a route path (the first segment), e.g. "/why-nursing/123"
 *  → "why-nursing". Returned to the backend so the assistant tailors its mode. */
export function moduleFromPath(pathname: string): string | undefined {
  const seg = pathname.split('/').filter(Boolean)[0];
  return seg ? seg.toLowerCase() : undefined;
}

/** A friendly label for a saved conversation in the history list. */
export function conversationLabel(c: Conversation): string {
  const title = c.title?.trim();
  if (title) return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
  return c.context ? `Chat · ${c.context}` : 'Conversation';
}

/** Map persisted messages to the panel's local turn view-model. */
export function toTurns(messages: readonly ConversationMessage[]): Turn[] {
  return messages.map((m) => ({ role: m.role, content: m.content, toolsUsed: m.toolsUsed }));
}

/** Whether the composer should allow sending (non-empty, not mid-flight). */
export function canSend(draft: string, sending: boolean): boolean {
  return draft.trim().length > 0 && !sending;
}

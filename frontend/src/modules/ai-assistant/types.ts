// Frontend types for the AI Assistant. These mirror the API responses (the backend's data shapes)
// — the frontend has no access to the backend data-layer package, so the contract is restated here.

export interface ChatContext {
  mode?: string;
  module?: string;
  collegeId?: string;
  essayId?: string;
}

export interface ChatInput {
  message: string;
  context?: ChatContext;
  conversationId?: string;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  citations: string[];
}

export interface Conversation {
  conversationId: string;
  userId: string;
  context?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  conversationId: string;
  messageId: string;
  role: 'user' | 'assistant';
  userId: string;
  content: string;
  context?: string;
  toolsUsed?: string[];
  createdAt: string;
  updatedAt: string;
}

/** A chat turn as rendered in the panel (local view model). */
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  citations?: string[];
}

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Spinner, Textarea } from '../../shared/ui';
import { getConversation, listConversations, sendChat } from './api';
import { canSend, conversationLabel, moduleFromPath, toTurns } from './logic';
import type { Conversation, Turn } from './types';

/** The AI Assistant slide-over body — registered into the shell's `ai-panel` slot. The shell owns
 *  the floating button + slide-over chrome; this is the chat itself: page-context aware, with
 *  per-user conversation history. */
export default function AiPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, sending]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setError(null);
    setDraft('');
    setTurns((t) => [...t, { role: 'user', content: message }]);
    setSending(true);
    try {
      const res = await sendChat({
        message,
        conversationId,
        context: { module: moduleFromPath(window.location.pathname) },
      });
      setConversationId(res.conversationId);
      setTurns((t) => [...t, { role: 'assistant', content: res.response, toolsUsed: res.toolsUsed, citations: res.citations }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not respond. Please try again.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function newChat(): void {
    setTurns([]);
    setConversationId(undefined);
    setError(null);
    setShowHistory(false);
  }

  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      setHistory(await listConversations());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  async function openConversation(id: string): Promise<void> {
    setShowHistory(false);
    setError(null);
    try {
      const { messages } = await getConversation(id);
      setTurns(toTurns(messages));
      setConversationId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that conversation.');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-surface-border px-3 py-2">
        <Button size="sm" variant="ghost" icon="chat" onClick={() => void openHistory()}>
          History
        </Button>
        <Button size="sm" variant="ghost" icon="plus" onClick={newChat}>
          New chat
        </Button>
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Your conversations</p>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-ink-500">No past conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((c) => (
                <li key={c.conversationId}>
                  <button
                    type="button"
                    onClick={() => void openConversation(c.conversationId)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-ink-700 hover:bg-surface-sunken"
                  >
                    {conversationLabel(c)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setShowHistory(false)}>
            Back to chat
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <p className="font-display text-xl font-semibold text-ink-900">What are we working on?</p>
                <p className="mt-1.5 max-w-xs text-sm text-ink-500">
                  I know everything you’ve logged — essays, interviews, college fit, your stats.
                </p>
                <div className="mt-4 flex max-w-xs flex-wrap justify-center gap-2">
                  {['Which of my experiences fit an essay about service?', 'How close am I to my top college?', 'What should I focus on this month?'].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDraft(q)}
                      className="rounded-full border border-primary-200 bg-primary-50/60 px-3 py-1.5 text-xs font-medium text-primary-800 transition hover:bg-primary-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      t.role === 'user'
                        ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white'
                        : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface-sunken px-3 py-2 text-sm text-ink-800'
                    }
                  >
                    {t.content}
                    {t.role === 'assistant' && t.citations && t.citations.length > 0 ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-ink-500">
                        {t.citations.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-surface-sunken px-3 py-2">
                  <Spinner size={16} />
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {error ? <p className="px-3 pb-1 text-xs text-error-600">{error}</p> : null}

          <div className="border-t border-surface-border p-3">
            <Textarea
              rows={2}
              value={draft}
              placeholder="Ask the assistant…  (Enter to send, Shift+Enter for a new line)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="mt-2 flex justify-end">
              <Button icon="chat" loading={sending} disabled={!canSend(draft, sending)} onClick={() => void send()}>
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

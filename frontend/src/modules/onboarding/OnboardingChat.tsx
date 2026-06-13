// Conversational onboarding (the FTUE). A short chat that interviews the family, extracts the student
// profile as it goes, and on finish seeds the profile + starter goals + college discovery server-side,
// then hands back to the dashboard. Falls back to the form wizard via "Prefer a quick form?".

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '../../shared/ui';
import { finishOnboarding, onboardingChat, type ChatMsg, type OnboardingProfile } from './api';

const GREETING =
  "Hi! I'll help set up the plan — it only takes a minute. To start: what grade is the student in (or their graduation year), and what subjects, majors, or careers are they drawn to?";

export default function OnboardingChat({ onComplete, onUseForm }: { onComplete: () => void; onUseForm: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState<OnboardingProfile>({});
  const [done, setDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const turn = await onboardingChat(next);
      setMessages((m) => [...m, { role: 'assistant', content: turn.reply }]);
      setProfile(turn.profile);
      setDone(turn.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setSending(false);
    }
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await finishOnboarding(profile);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setup.');
      setFinishing(false);
    }
  }

  return (
    <div className="flex h-[70vh] max-h-[600px] flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-1">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface-sunken px-3 py-2 text-sm text-ink-800'
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-surface-sunken px-3 py-2">
              <Spinner size={16} />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="px-1 py-1 text-xs text-error-600">{error}</p> : null}

      {done ? (
        <div className="border-t border-surface-border pt-3">
          <p className="mb-2 text-sm text-ink-600">
            Great — I&rsquo;ll save this, suggest a few starter goals, and start finding programs for the major.
          </p>
          <Button className="w-full" loading={finishing} onClick={() => void finish()}>
            Finish &amp; open the dashboard
          </Button>
        </div>
      ) : (
        <div className="border-t border-surface-border pt-3">
          <div className="flex items-end gap-2">
            <input
              className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Type your answer…"
              disabled={sending}
              autoFocus
            />
            <Button onClick={() => void send()} disabled={sending || !input.trim()} icon="chat">
              Send
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onUseForm}
        className="mt-2 self-center text-xs text-ink-400 hover:text-ink-600 hover:underline"
      >
        Prefer a quick form instead?
      </button>
    </div>
  );
}

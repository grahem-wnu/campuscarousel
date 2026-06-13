// Conversational onboarding (the FTUE). A short chat interviews the family and extracts the student
// profile as it goes; when it has enough it hands to a pre-filled REVIEW step so the family can correct
// anything (a misheard name, the grad year) before it saves. On finish the backend seeds the profile +
// starter goals + college discovery, then we hand off to the dashboard. "Prefer a quick form?" falls
// back to the legacy wizard.

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select, Spinner } from '../../shared/ui';
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
      // MERGE cumulatively — the model sometimes drops earlier fields on later turns; keep what we had.
      setProfile((prev) => ({ ...prev, ...turn.profile }));
      setDone(turn.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setSending(false);
    }
  }

  async function finish(edited: OnboardingProfile) {
    setFinishing(true);
    setError(null);
    try {
      await finishOnboarding(edited);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setup.');
      setFinishing(false);
    }
  }

  // Review step: confirm/correct what the chat gathered before saving.
  if (done) {
    return (
      <div className="flex max-h-[70vh] flex-col overflow-y-auto">
        {error ? <p className="px-1 pb-2 text-xs text-error-600">{error}</p> : null}
        <ReviewForm initial={profile} finishing={finishing} onFinish={(p) => void finish(p)} />
      </div>
    );
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

/** Pre-filled confirmation of what the chat captured. The family fixes anything (a misheard name, the
 *  grad year) and the EDITED values are what get saved + seeded. */
function ReviewForm({
  initial,
  finishing,
  onFinish,
}: {
  initial: OnboardingProfile;
  finishing: boolean;
  onFinish: (p: OnboardingProfile) => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [gradYear, setGradYear] = useState(initial.graduationYear ? String(initial.graduationYear) : '');
  const [majors, setMajors] = useState((initial.intendedMajors ?? []).join(', '));
  const [careerGoal, setCareerGoal] = useState(initial.careerGoal ?? '');
  const [gpa, setGpa] = useState(initial.currentGPA != null ? String(initial.currentGPA) : '');
  const [gpaType, setGpaType] = useState<'weighted' | 'unweighted'>(initial.gpaType ?? 'unweighted');
  const [location, setLocation] = useState(initial.location ?? '');
  const [budget, setBudget] = useState(initial.budgetTotal != null ? String(initial.budgetTotal) : '');

  function submit() {
    const p: OnboardingProfile = { gpaType };
    if (name.trim()) p.name = name.trim();
    if (gradYear) p.graduationYear = Number(gradYear);
    const majorList = majors.split(',').map((m) => m.trim()).filter(Boolean);
    if (majorList.length) p.intendedMajors = majorList;
    if (careerGoal.trim()) p.careerGoal = careerGoal.trim();
    if (gpa) p.currentGPA = Number(gpa);
    if (location.trim()) p.location = location.trim();
    if (budget) p.budgetTotal = Number(budget);
    onFinish(p);
  }

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-ink-700">Here&rsquo;s what I got — fix anything, then finish.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Student name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As they spell it" />
        </Field>
        <Field label="Graduation year">
          <Input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2028" />
        </Field>
        <Field label="Intended major(s)" hint="Comma-separated">
          <Input value={majors} onChange={(e) => setMajors(e.target.value)} placeholder="e.g. Psychology" />
        </Field>
        <Field label="Career goal">
          <Input value={careerGoal} onChange={(e) => setCareerGoal(e.target.value)} placeholder="e.g. Clinical Psychologist" />
        </Field>
        <Field label="Current GPA">
          <Input type="number" step="0.01" value={gpa} onChange={(e) => setGpa(e.target.value)} placeholder="4.0" />
        </Field>
        <Field label="GPA type">
          <Select value={gpaType} onChange={(e) => setGpaType(e.target.value as 'weighted' | 'unweighted')}>
            <option value="unweighted">Unweighted</option>
            <option value="weighted">Weighted</option>
          </Select>
        </Field>
        <Field label="Location (city, state)">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Aliso Viejo, CA" />
        </Field>
        <Field label="Family college budget ($)">
          <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="200000" />
        </Field>
      </div>
      <Button className="mt-4 w-full" loading={finishing} onClick={submit}>
        Finish &amp; open the dashboard
      </Button>
    </div>
  );
}

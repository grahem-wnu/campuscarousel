import { useState } from 'react';
import { Button, Card, Field, Input, Spinner, Textarea } from '../../shared/ui';
import { FeedbackCard } from './FeedbackCard';
import { startMock, submitAnswer } from './api';
import type { AnswerFeedback, Interview } from './types';

interface Props {
  onSessionChanged?: () => void;
}

/** Run an AI mock interview: pick a school + length, then answer questions one at a time and get
 *  grounded coaching after each. */
export function MockInterview({ onSessionChanged }: Props) {
  const [session, setSession] = useState<Interview | null>(null);
  const [school, setSchool] = useState('');
  const [count, setCount] = useState('6');
  const [starting, setStarting] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setStarting(true);
    setError(null);
    try {
      const res = await startMock({ school: school.trim() || undefined, count: Number(count) || 6 });
      setSession(res.session);
      setIndex(0);
      setAnswer('');
      setFeedback(null);
      onSessionChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a mock. Try again.');
    } finally {
      setStarting(false);
    }
  }

  async function submit() {
    if (!session || !answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitAnswer(session.sessionId, index, answer.trim());
      setFeedback(res.feedback);
      setSession(res.session);
      onSessionChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not score that answer.');
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    setAnswer('');
    setFeedback(null);
  }

  if (!session) {
    return (
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Start a mock interview</h2>
        <p className="text-sm text-ink-500">
          The AI asks admissions interview questions one at a time and coaches each answer using your real journal,
          experience hours, and reflections.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="School (optional)" className="min-w-[12rem] flex-1">
            <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Ohio State University" />
          </Field>
          <Field label="Questions">
            <Input type="number" min="1" max="15" value={count} onChange={(e) => setCount(e.target.value)} className="w-24" />
          </Field>
          <Button icon="interview" loading={starting} onClick={() => void begin()}>Start</Button>
        </div>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
      </Card>
    );
  }

  const questions = session.questions ?? [];
  const total = questions.length;
  const done = index >= total;
  const current = questions[index];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-500">
        <span>{done ? 'Mock complete' : `Question ${index + 1} of ${total}`}</span>
        <Button size="sm" variant="ghost" onClick={() => setSession(null)}>New mock</Button>
      </div>

      {done ? (
        <Card className="text-center">
          <p className="text-sm font-medium text-ink-800">Nice work — you answered {total} questions.</p>
          <p className="mt-1 text-sm text-ink-500">Review your ratings in the History tab, then run another mock.</p>
          <Button className="mt-3" icon="interview" onClick={() => setSession(null)}>Start another</Button>
        </Card>
      ) : (
        <>
          <Card className="bg-surface-sunken">
            <p className="text-base font-medium text-ink-900">{current?.question}</p>
          </Card>

          {feedback ? (
            <>
              <FeedbackCard feedback={feedback} />
              <Button icon="check" onClick={next}>{index + 1 >= total ? 'Finish' : 'Next question'}</Button>
            </>
          ) : (
            <Card className="space-y-2">
              <Field label="Your answer">
                <Textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer out loud, then type the key points…" />
              </Field>
              {error ? <p className="text-sm text-error-600">{error}</p> : null}
              <Button loading={submitting} disabled={!answer.trim()} onClick={() => void submit()}>
                {submitting ? 'Coaching…' : 'Get feedback'}
              </Button>
            </Card>
          )}

          {submitting && !feedback ? (
            <div className="flex justify-center py-2"><Spinner /></div>
          ) : null}
        </>
      )}
    </div>
  );
}

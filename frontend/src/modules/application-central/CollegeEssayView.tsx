import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Spinner } from '../../shared/ui';
import { EssayWorkspace } from './EssayWorkspace';
import { ESSAY_STATUS_META, VERDICT_META, latestDraft } from './logic';
import { createEssay, getPracticeQuestionJob, listEssays, startPracticeQuestions } from './api';
import type { Essay, PracticeQuestionSet } from './types';

export const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 min; generation runs on the 300s worker but is usually ~25-40s

interface Props {
  college: { collegeId: string; name: string };
  /** `new` skips straight to searching for a fresh question; `attempts` opens this college's list. */
  startMode: 'new' | 'attempts';
  onBack: () => void;
}

type Sub = 'attempts' | 'searching' | 'questions';

/** One college's essay workspace: its practice attempts, a search for a fresh (real or clearly
 *  disclosed) essay question, and the writing surface — all seeded with this FIXED college (no
 *  picker, no typed-school, no general practice). "← back to colleges" returns to the list. */
export function CollegeEssayView({ college, startMode, onBack }: Props) {
  const [sub, setSub] = useState<Sub>(startMode === 'new' ? 'searching' : 'attempts');
  const [essays, setEssays] = useState<Essay[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [set, setSet] = useState<PracticeQuestionSet | null>(null);
  const [selected, setSelected] = useState<Essay | null>(null);
  const [writingIdx, setWritingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: a slow question-search must never overwrite a newer one.
  const reqRef = useRef(0);

  const loadAttempts = useCallback(async () => {
    setLoadingAttempts(true);
    try {
      setEssays(await listEssays({ collegeId: college.collegeId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your essays.');
    } finally {
      setLoadingAttempts(false);
    }
  }, [college.collegeId]);

  // Start an async practice-question job (seeded with this fixed college) and poll until it settles.
  // Model-only generation 503s at the request path's ~30s ceiling, so the API returns 202 and the
  // worker fills the result. The reqRef stale-guard wraps the WHOLE start+poll sequence.
  const search = useCallback(async () => {
    const myReq = ++reqRef.current;
    setSub('searching');
    setSet(null);
    setError(null);
    try {
      let job = await startPracticeQuestions({ collegeId: college.collegeId });
      for (let i = 0; job.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (myReq !== reqRef.current) return; // superseded by a newer search
        job = await getPracticeQuestionJob(job.jobId);
      }
      if (myReq !== reqRef.current) return;
      if (job.status === 'failed') {
        setError('Could not pull questions right now — please try again in a moment.');
        setSub('attempts');
        return;
      }
      if (job.status === 'pending') {
        setError('This is taking longer than expected — please try again in a moment.');
        setSub('attempts');
        return;
      }
      setSet(job.result ?? { questions: [], source: 'ai', usedRealPrompts: false });
      setSub('questions');
    } catch (err) {
      if (myReq !== reqRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load practice questions.');
      setSub('attempts');
    }
  }, [college.collegeId]);

  // Load this college's attempts once; if we're starting on `new`, also kick off the search.
  useEffect(() => {
    void loadAttempts();
    if (startMode === 'new') void search();
    // Seeds are fixed for this mounted view; loadAttempts/search are stable useCallback closures.
  }, [loadAttempts, search, startMode]);

  function onEssayChanged(updated: Essay) {
    setSelected(updated);
    setEssays((prev) => prev.map((e) => (e.essayId === updated.essayId ? updated : e)));
  }

  async function write(question: string, idx: number) {
    setWritingIdx(idx);
    setError(null);
    try {
      const essay = await createEssay({
        collegeId: college.collegeId,
        prompt: question,
        promptSource: set?.usedRealPrompts ? 'college' : 'practice',
      });
      setSelected(essay);
      setWritingIdx(null);
      void loadAttempts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the essay.');
      setWritingIdx(null);
    }
  }

  // Writing surface — opens the existing workspace for the selected attempt.
  if (selected) {
    return (
      <EssayWorkspace
        essay={selected}
        collegeName={college.name}
        onChanged={onEssayChanged}
        onBack={() => {
          setSelected(null);
          setSub('attempts');
          void loadAttempts();
        }}
        onTryAnother={() => {
          setSelected(null);
          void search();
        }}
      />
    );
  }

  const backBar = (
    <div className="flex items-center justify-between">
      <Button size="sm" variant="ghost" onClick={onBack}>← back to colleges</Button>
    </div>
  );

  // Searching — the async question job is in flight.
  if (sub === 'searching') {
    return (
      <div className="space-y-4">
        {backBar}
        <Card role="status" className="flex items-center gap-3">
          <Spinner />
          <p className="text-sm text-ink-700">Looking for practice questions for {college.name}…</p>
        </Card>
      </div>
    );
  }

  // Questions — cards to write about, with a clear disclosure when they're generic.
  if (sub === 'questions' && set) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={onBack}>← back to colleges</Button>
          <Button size="sm" variant="ghost" onClick={() => setSub('attempts')}>Your attempts</Button>
        </div>
        {set.usedRealPrompts === false && set.questions.length > 0 ? (
          <Card role="status" className="border border-secondary-200 bg-secondary-50">
            <p className="text-sm text-ink-700">
              I couldn’t find {college.name}’s current essay questions, so these are general practice
              prompts of the kind admissions essays ask.
            </p>
          </Card>
        ) : null}
        {set.questions.length === 0 ? (
          <Card role="status" className="border border-secondary-200 bg-secondary-50">
            <p className="text-sm text-ink-700">
              I couldn’t pull any questions for {college.name} right now — try searching again in a moment.
            </p>
            <div className="mt-2">
              <Button size="sm" onClick={() => void search()}>Search again</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {set.questions.map((q, i) => (
              <Card key={i} className="space-y-1.5">
                <p className="font-serif text-base text-ink-900">{q.question}</p>
                {q.why ? <p className="text-xs text-ink-500">{q.why}</p> : null}
                {q.tip ? <p className="text-xs italic text-primary-700">Tip: {q.tip}</p> : null}
                <div>
                  <Button
                    size="sm"
                    loading={writingIdx === i}
                    disabled={writingIdx !== null}
                    onClick={() => void write(q.question, i)}
                  >
                    Write about this one
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
      </div>
    );
  }

  // Attempts — this college's practice essays plus a way to search for a fresh question.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>← back to colleges</Button>
        <Button size="sm" icon="plus" onClick={() => void search()}>Search for a new question</Button>
      </div>
      <header>
        <h2 className="font-display text-lg font-semibold text-ink-900">{college.name}</h2>
        <p className="mt-0.5 text-sm text-ink-500">Your practice essays for this school.</p>
      </header>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      {loadingAttempts ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : essays.length === 0 ? (
        <Card className="space-y-2 text-center">
          <p className="text-sm text-ink-600">No practice essays for {college.name} yet.</p>
          <div>
            <Button size="sm" onClick={() => void search()}>Search for a question to start</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {essays.map((e) => {
            const meta = ESSAY_STATUS_META[e.status ?? 'brainstorming'];
            const ld = latestDraft(e);
            return (
              <button
                key={e.essayId}
                type="button"
                onClick={() => setSelected(e)}
                className="block w-full rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{e.prompt || 'Untitled essay'}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {e.lastReview ? (
                      <Badge tone={VERDICT_META[e.lastReview.verdict].tone}>{e.lastReview.overall}/10</Badge>
                    ) : null}
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {e.drafts?.length ?? 0} draft{(e.drafts?.length ?? 0) === 1 ? '' : 's'}
                  {ld?.wordCount ? ` · ${ld.wordCount} words` : ''}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

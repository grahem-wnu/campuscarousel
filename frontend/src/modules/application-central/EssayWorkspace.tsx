import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Icon, Spinner, Textarea } from '../../shared/ui';
import { VERDICT_META, ratingRows, ratingTone, wordCount, wordTargetTone } from './logic';
import { getEssayEvaluationJob, startEssayEvaluation, updateEssay } from './api';
import type { Essay, EssayReview } from './types';

interface Props {
  essay: Essay;
  collegeName?: string;
  onChanged: (essay: Essay) => void;
  onBack: () => void;
  /** Return to the questions-first front door (auto-saving the current body first). */
  onTryAnother?: () => void;
}

/** Common App cap — the coaching default when an essay has no target of its own. */
const DEFAULT_TARGET_WORDS = 650;

/** Async evaluation runs ~15–20s on the essay-coach worker; poll until it settles. */
export const POLL_MS = 3000;
const MAX_POLLS = 30; // ~90s ceiling — the worker has 300s but a review is usually well under a minute.

/** The workspace has three views: `editing` (prompt, editor, coach sidebar), `evaluating` (a clear
 *  full "up to a minute" panel while the async job runs), and `result` (the rubric-rated feedback —
 *  bars + score + verdict + strengths/improve, never a rewrite — with "Back to editing"). */
type Mode = 'editing' | 'evaluating' | 'result';

/** The essay workspace: prompt, a single autosaved editor with a live word count, and an AI coach
 *  sidebar — "Try a different question" (autosave the body, then back to the questions-first front
 *  door) and "Evaluate" (async rubric-rated feedback, grounded in her real privacy-filtered
 *  experiences + what the target college looks for — never a rewrite). The body autosaves as a
 *  single-slot draft (debounce + blur); there is no version history or draft lifecycle. */
export function EssayWorkspace({ essay, collegeName, onChanged, onBack, onTryAnother }: Props) {
  // Seed once from the latest draft (useState initializer runs on mount only, and this component has
  // no `key`, so an onChanged after autosave never resets the editor).
  const [text, setText] = useState(() => (essay.drafts ?? []).at(-1)?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>('editing');
  const [review, setReview] = useState<EssayReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: a slow evaluation must never overwrite a newer one (or a "Back to editing").
  const reqRef = useRef(0);
  // Guards the debounce so the seeded value is never autosaved before the user edits it.
  const dirtyRef = useRef(false);

  const wc = wordCount(text);
  const target = essay.targetWords ?? DEFAULT_TARGET_WORDS;

  /** Persist the current body as the single autosaved draft (a single-slot overwrite — no history).
   *  Returns true on success, false if the save failed (so callers that navigate away can abort and
   *  avoid losing the body). An empty body is a no-op success. */
  const saveBody = useCallback(async (): Promise<boolean> => {
    if (!text.trim()) return true;
    setSaving(true);
    setError(null);
    try {
      onChanged(
        await updateEssay(essay.essayId, {
          drafts: [{ version: 1, content: text, createdAt: new Date().toISOString(), wordCount: wc }],
        }),
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [text, wc, essay.essayId, onChanged]);

  // Autosave: debounce on the body (skipping the seeded value via dirtyRef). saveBody is memoized on
  // its inputs, so a new keystroke replaces the pending timer — honest deps, no eslint-disable.
  useEffect(() => {
    if (!dirtyRef.current) return; // don't save the seeded value
    const t = setTimeout(() => { void saveBody(); }, 800);
    return () => clearTimeout(t);
  }, [saveBody]);

  /** Preserve the current body as an attempt, then return to the questions-first front door. If the
   *  autosave fails, stay put (the error is shown) so the body is never silently lost. */
  async function tryAnother() {
    if (await saveBody()) onTryAnother?.();
  }

  /** Start an async evaluation and poll until it settles. Evaluation runs ~15–20s (near the request
   *  path's ~30s ceiling), so the API returns 202 and the essay-coach worker fills the result. The
   *  reqRef stale-guard wraps the WHOLE start+poll sequence (a newer Evaluate, or "Back to editing",
   *  bumps it and this run bails without touching state). */
  async function evaluate() {
    if (!text.trim()) return;
    const myReq = ++reqRef.current;
    setMode('evaluating');
    setReview(null);
    setError(null);
    try {
      let job = await startEssayEvaluation(essay.essayId, { content: text, targetWords: target });
      for (let i = 0; job.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (myReq !== reqRef.current) return; // superseded by a newer request
        job = await getEssayEvaluationJob(essay.essayId, job.jobId);
      }
      if (myReq !== reqRef.current) return;
      if (job.status === 'failed' || (job.status === 'complete' && !job.result)) {
        setError('Could not evaluate your essay right now — please try again in a moment.');
        setMode('editing');
        return;
      }
      if (job.status === 'pending') {
        setError('Evaluation is taking longer than expected — please try again in a moment.');
        setMode('editing');
        return;
      }
      setReview(job.result ?? null);
      setMode('result');
    } catch (err) {
      if (myReq !== reqRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not evaluate the essay.');
      setMode('editing');
    }
  }

  /** Return to the editor from the result view (the body is preserved in local state). */
  function backToEditing() {
    reqRef.current++; // invalidate any in-flight evaluation
    setMode('editing');
  }

  /** Copy the current essay text, ready to paste into the Common App / a college portal. */
  async function copyEssay() {
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy — select the text in the editor and copy it manually.');
    }
  }

  // Evaluating — a clear full panel while the async essay-coach job runs.
  if (mode === 'evaluating') {
    return (
      <Card role="status" className="flex flex-col items-center gap-3 py-16 text-center">
        <Spinner />
        <p className="font-display text-base font-semibold text-ink-800">
          Evaluating your essay — this can take up to a minute.
        </p>
        <p className="text-sm text-ink-500">The coach is reading your draft and rating it against the rubric.</p>
      </Card>
    );
  }

  // Result — the rubric-rated feedback, with a way back to the editor (body preserved).
  if (mode === 'result' && review) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={backToEditing}>← Back</Button>
        </div>
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Feedback</p>
            <Badge tone="neutral">{review.wordCount}w · never a rewrite</Badge>
          </div>
          {review.overall !== undefined && review.verdict ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-ink-900">{review.overall}<span className="text-sm font-normal text-ink-400">/10</span></span>
              <Badge tone={VERDICT_META[review.verdict].tone}>{VERDICT_META[review.verdict].label}</Badge>
            </div>
          ) : review.source === 'curated' ? (
            <p className="text-xs text-ink-400">AI rating unavailable right now — showing basic checks.</p>
          ) : null}
          {review.ratings ? (
            <ul className="space-y-1">
              {ratingRows(review.ratings).map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-600">{r.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className={`block h-full rounded-full ${ratingTone(r.score) === 'success' ? 'bg-success-500' : ratingTone(r.score) === 'warn' ? 'bg-warn-500' : 'bg-error-500'}`}
                        style={{ width: `${r.score * 10}%` }}
                      />
                    </span>
                    <span className="w-4 text-right text-xs font-semibold text-ink-700">{r.score}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {review.strengths.length ? <div><p className="text-xs font-medium text-success-700">Strengths</p><ul className="list-disc pl-5 text-sm text-ink-700">{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
          {review.improvements.length ? <div><p className="text-xs font-medium text-warn-700">Improve</p><ul className="list-disc pl-5 text-sm text-ink-700">{review.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}
          {review.authenticity ? <p className="text-sm italic text-ink-600">{review.authenticity}</p> : null}
        </Card>
        <div>
          <Button size="sm" onClick={backToEditing}>Back to editing</Button>
        </div>
      </div>
    );
  }

  // Editing — the writing surface with the coach sidebar.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onBack}>← Essays</Button>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Prompt</p>
          {collegeName ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-700">
              <Icon name="school" size={13} /> {collegeName}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink-800">{essay.prompt || 'No prompt set — add one in the essay’s details.'}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Editor */}
        <div className="space-y-2 lg:col-span-2">
          <Textarea
            rows={16}
            value={text}
            onChange={(e) => { dirtyRef.current = true; setText(e.target.value); }}
            onBlur={() => void saveBody()}
            placeholder="Write your essay here…"
            className="font-serif"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Badge tone={wordTargetTone(wc, target)}>{wc} / {target} words</Badge>
              {saving ? <span className="text-xs text-ink-400">Saving…</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" icon={copied ? 'check' : 'copy'} disabled={!text.trim()} onClick={() => void copyEssay()}>
                {copied ? 'Copied' : 'Copy essay'}
              </Button>
            </span>
          </div>
        </div>

        {/* AI coach sidebar */}
        <div className="space-y-3">
          <Card className="space-y-2 border border-primary-200 bg-primary-50">
            <div className="flex items-center gap-1.5 font-display text-base font-semibold text-primary-900">
              <Icon name="star" size={15} className="text-secondary-600" /> Essay coach
            </div>
            {onTryAnother ? (
              <Button size="sm" variant="outline" block loading={saving} onClick={() => void tryAnother()}>Try a different question</Button>
            ) : null}
            <Button size="sm" variant="outline" block disabled={!text.trim()} onClick={() => void evaluate()}>Evaluate</Button>
            <p className="text-[11px] text-primary-700">
              Grounded in your logged experiences{collegeName ? ` and what ${collegeName} looks for` : ''}. The AI coaches and rates — it never writes the essay for you.
            </p>
          </Card>
        </div>
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </div>
  );
}

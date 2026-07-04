import { useState } from 'react';
import { Badge, Button, Card, Icon, Spinner, Textarea } from '../../shared/ui';
import { ESSAY_STATUS_META, VERDICT_META, ratingRows, ratingTone, wordCount, wordTargetTone } from './logic';
import { addDraft, findExperiences, getPracticeQuestions, reviewEssay, updateEssay } from './api';
import type { Essay, EssayReview, FindResult, PracticeQuestionSet } from './types';

interface Props {
  essay: Essay;
  collegeName?: string;
  onChanged: (essay: Essay) => void;
  onBack: () => void;
}

/** Common App cap — the coaching default when an essay has no target of its own. */
const DEFAULT_TARGET_WORDS = 650;

/** The essay workspace: prompt, editor with live word count + version history, and an AI coach
 *  sidebar — "Find relevant experiences" (grounded in her real, privacy-filtered data + what the
 *  target college looks for), "Practice questions" (sample prompts in the college's style), and
 *  "Check my essay" (rubric-rated feedback — never a rewrite). */
export function EssayWorkspace({ essay, collegeName, onChanged, onBack }: Props) {
  const latest = (essay.drafts ?? []).at(-1);
  const [text, setText] = useState(latest?.content ?? '');
  const [savingDraft, setSavingDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFinalNudge, setShowFinalNudge] = useState(false);

  const [target, setTarget] = useState<number>(essay.targetWords ?? DEFAULT_TARGET_WORDS);

  const [find, setFind] = useState<FindResult | null>(null);
  const [finding, setFinding] = useState(false);
  const [review, setReview] = useState<EssayReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [practice, setPractice] = useState<PracticeQuestionSet | null>(null);
  const [practicing, setPracticing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wc = wordCount(text);
  const meta = ESSAY_STATUS_META[essay.status ?? 'brainstorming'];

  async function saveDraft() {
    if (!text.trim()) return;
    setSavingDraft(true);
    setError(null);
    try {
      onChanged(await addDraft(essay.essayId, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function runFind() {
    setFinding(true);
    setError(null);
    try {
      setFind((await findExperiences(essay.essayId)).result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find experiences.');
    } finally {
      setFinding(false);
    }
  }

  async function runPractice() {
    setPracticing(true);
    setError(null);
    try {
      setPractice(await getPracticeQuestions(essay.essayId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate practice questions.');
    } finally {
      setPracticing(false);
    }
  }

  async function runReview() {
    if (!text.trim()) return;
    setReviewing(true);
    setError(null);
    try {
      const res = await reviewEssay(essay.essayId, { content: text, targetWords: target });
      setReview(res.review);
      onChanged(res.essay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review the essay.');
    } finally {
      setReviewing(false);
    }
  }

  async function setStatus(status: Essay['status']) {
    onChanged(await updateEssay(essay.essayId, { status }));
  }

  /** Copy the current essay text, ready to paste into the Common App / a college portal. */
  async function copyEssay() {
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      if (essay.status !== 'final') setShowFinalNudge(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy — select the text in the editor and copy it manually.');
    }
  }

  /** Persist an edited word target (a coaching target, never a hard limit). */
  async function saveTarget() {
    const clamped = Math.min(5000, Math.max(50, Math.round(target) || DEFAULT_TARGET_WORDS));
    if (clamped !== target) setTarget(clamped);
    if (clamped === (essay.targetWords ?? DEFAULT_TARGET_WORDS)) return;
    try {
      onChanged(await updateEssay(essay.essayId, { targetWords: clamped }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the word target.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onBack}>← Essays</Button>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {essay.status !== 'final' ? (
            <Button size="sm" variant="outline" onClick={() => void setStatus('final')}>Mark final</Button>
          ) : null}
        </div>
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
          <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your essay here…" className="font-serif" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Badge tone={wordTargetTone(wc, target)}>{wc} / {target} words</Badge>
              <label className="flex items-center gap-1 text-xs text-ink-500">
                target
                <input
                  type="number"
                  min={50}
                  max={5000}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value) || DEFAULT_TARGET_WORDS)}
                  onBlur={() => void saveTarget()}
                  className="w-16 rounded-md border border-surface-border bg-surface-raised px-1.5 py-0.5 text-xs text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                  aria-label="Word target for this essay"
                />
              </label>
            </span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" icon={copied ? 'check' : 'copy'} disabled={!text.trim()} onClick={() => void copyEssay()}>
                {copied ? 'Copied' : 'Copy essay'}
              </Button>
              <Button size="sm" loading={savingDraft} disabled={!text.trim()} onClick={() => void saveDraft()}>
                Save draft v{(essay.drafts?.length ?? 0) + 1}
              </Button>
            </span>
          </div>
          {showFinalNudge && essay.status !== 'final' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-secondary-200 bg-secondary-50 px-3 py-2">
              <p className="text-sm text-ink-700">Pasted into the portal? Mark this essay final so the tracker stays honest.</p>
              <span className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => void setStatus('final')}>Mark final</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowFinalNudge(false)}>Not yet</Button>
              </span>
            </div>
          ) : null}
          {essay.drafts && essay.drafts.length > 0 ? (
            <p className="text-xs text-ink-400">Version history: {essay.drafts.map((d) => `v${d.version} (${d.wordCount ?? wordCount(d.content)}w)`).join(' · ')}</p>
          ) : null}
        </div>

        {/* AI coach sidebar */}
        <div className="space-y-3">
          <Card className="space-y-2 border border-primary-200 bg-primary-50">
            <div className="flex items-center gap-1.5 font-display text-base font-semibold text-primary-900">
              <Icon name="star" size={15} className="text-secondary-600" /> Essay coach
            </div>
            <Button size="sm" variant="outline" block loading={finding} onClick={() => void runFind()}>Find relevant experiences</Button>
            <Button size="sm" variant="outline" block loading={practicing} onClick={() => void runPractice()}>Practice questions</Button>
            <Button size="sm" variant="outline" block loading={reviewing} disabled={!text.trim()} onClick={() => void runReview()}>Check &amp; rate my essay</Button>
            <p className="text-[11px] text-primary-700">
              Grounded in your logged experiences{collegeName ? ` and what ${collegeName} looks for` : ''}. The AI coaches and rates — it never writes the essay for you.
            </p>
          </Card>

          {finding ? <div className="flex justify-center py-3"><Spinner /></div> : find ? (
            <Card className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Draw on these</p>
              <ul className="space-y-1.5 text-sm">
                {find.suggestedExperiences.map((s, i) => (
                  <li key={i}><span className="font-medium text-ink-800">{s.title}</span> <span className="text-ink-500">— {s.why}</span></li>
                ))}
              </ul>
              {find.angles.length ? (
                <>
                  <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Angles</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-700">{find.angles.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </>
              ) : null}
            </Card>
          ) : null}

          {practicing ? <div className="flex justify-center py-3"><Spinner /></div> : practice ? (
            <Card className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Practice questions{practice.collegeName ? ` · ${practice.collegeName} style` : ''}
              </p>
              <ul className="space-y-2 text-sm">
                {practice.questions.map((q, i) => (
                  <li key={i} className="space-y-0.5">
                    <p className="font-medium text-ink-800">{q.question}</p>
                    {q.why ? <p className="text-xs text-ink-500">{q.why}</p> : null}
                    {q.tip ? <p className="text-xs italic text-primary-700">Tip: {q.tip}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {reviewing ? <div className="flex justify-center py-3"><Spinner /></div> : review ? (
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
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </div>
  );
}

import { useState } from 'react';
import { Badge, Button, Card, Icon, Spinner, Textarea } from '../../shared/ui';
import { ESSAY_STATUS_META, wordCount, wordTargetTone } from './logic';
import { addDraft, findExperiences, reviewEssay, updateEssay } from './api';
import type { Essay, EssayReview, FindResult } from './types';

interface Props {
  essay: Essay;
  onChanged: (essay: Essay) => void;
  onBack: () => void;
}

const TARGET_WORDS = 650; // common-app-ish default

/** The essay workspace: prompt, editor with live word count + version history, and an AI context
 *  sidebar — "Find relevant experiences" (grounded in her real, privacy-filtered data) and
 *  "Check my essay" (feedback only, never a rewrite). */
export function EssayWorkspace({ essay, onChanged, onBack }: Props) {
  const latest = (essay.drafts ?? []).at(-1);
  const [text, setText] = useState(latest?.content ?? '');
  const [savingDraft, setSavingDraft] = useState(false);

  const [find, setFind] = useState<FindResult | null>(null);
  const [finding, setFinding] = useState(false);
  const [review, setReview] = useState<EssayReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
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

  async function runReview() {
    if (!text.trim()) return;
    setReviewing(true);
    setError(null);
    try {
      setReview(await reviewEssay(essay.essayId, { content: text, targetWords: TARGET_WORDS }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review the essay.');
    } finally {
      setReviewing(false);
    }
  }

  async function setStatus(status: Essay['status']) {
    onChanged(await updateEssay(essay.essayId, { status }));
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
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Prompt</p>
        <p className="mt-1 text-sm text-ink-800">{essay.prompt || 'No prompt set — add one in the essay’s details.'}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Editor */}
        <div className="space-y-2 lg:col-span-2">
          <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your essay here…" className="font-serif" />
          <div className="flex items-center justify-between text-sm">
            <Badge tone={wordTargetTone(wc, TARGET_WORDS)}>{wc} / {TARGET_WORDS} words</Badge>
            <Button size="sm" loading={savingDraft} disabled={!text.trim()} onClick={() => void saveDraft()}>
              Save draft v{(essay.drafts?.length ?? 0) + 1}
            </Button>
          </div>
          {essay.drafts && essay.drafts.length > 0 ? (
            <p className="text-xs text-ink-400">Version history: {essay.drafts.map((d) => `v${d.version} (${d.wordCount ?? wordCount(d.content)}w)`).join(' · ')}</p>
          ) : null}
        </div>

        {/* AI sidebar */}
        <div className="space-y-3">
          <Card className="space-y-2 border border-primary-200 bg-primary-50">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-800">
              <Icon name="star" size={15} /> Essay partner
            </div>
            <Button size="sm" variant="outline" block loading={finding} onClick={() => void runFind()}>Find relevant experiences</Button>
            <Button size="sm" variant="outline" block loading={reviewing} disabled={!text.trim()} onClick={() => void runReview()}>Check my essay (feedback only)</Button>
            <p className="text-[11px] text-primary-700">The AI suggests and critiques — it never writes the essay for you.</p>
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

          {reviewing ? <div className="flex justify-center py-3"><Spinner /></div> : review ? (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Feedback</p>
                <Badge tone="neutral">{review.wordCount}w · feedback only</Badge>
              </div>
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

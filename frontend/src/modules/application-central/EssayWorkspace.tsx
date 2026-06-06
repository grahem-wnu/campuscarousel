import { useMemo, useState } from 'react';
import { Badge, Button, Card, Icon, Spinner, Textarea } from '../../shared/ui';
import { findExperiences, reviewEssay, updateEssay } from './api';
import { SOURCE_LABEL, STATUS_META, draftsNewestFirst, latestDraft, wordCount, wordCountTone } from './logic';
import type { Essay, EssayFeedback, SelectedExperience } from './types';

interface Props {
  essay: Essay;
  onUpdated: (essay: Essay) => void;
}

const TONE_CLASS: Record<string, string> = {
  neutral: 'text-ink-500',
  success: 'text-success-700',
  warn: 'text-warn-700',
  error: 'text-error-700',
};

/** The essay workspace: prompt, editor with versioned drafts + word count vs target, and the AI
 *  context sidebar (find relevant experiences, suggested angles, check-my-essay feedback). */
export function EssayWorkspace({ essay, onUpdated }: Props) {
  const [content, setContent] = useState(latestDraft(essay.drafts)?.content ?? '');
  const [target, setTarget] = useState('650');
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [experiences, setExperiences] = useState<SelectedExperience[]>([]);
  const [angles, setAngles] = useState<string[]>([]);
  const [findingExp, setFindingExp] = useState(false);

  const [feedback, setFeedback] = useState<EssayFeedback | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const count = useMemo(() => wordCount(content), [content]);
  const targetNum = target.trim() ? Number(target) : null;
  const tone = wordCountTone(count, Number.isFinite(targetNum) ? targetNum : null);
  const history = draftsNewestFirst(essay.drafts);
  const latest = latestDraft(essay.drafts);
  const dirty = content !== (latest?.content ?? '');

  async function saveDraft() {
    setSavingDraft(true);
    setError(null);
    try {
      onUpdated(await updateEssay(essay.essayId, { addDraftContent: content }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function runFindExperiences() {
    setFindingExp(true);
    setError(null);
    try {
      const res = await findExperiences(essay.essayId);
      setExperiences(res.experiences);
      setAngles(res.angles);
      onUpdated(res.essay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find experiences.');
    } finally {
      setFindingExp(false);
    }
  }

  async function runReview() {
    setReviewing(true);
    setError(null);
    try {
      setFeedback(await reviewEssay(essay.essayId, content));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review the essay.');
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
      {/* Editor column */}
      <div className="space-y-3">
        {essay.prompt ? (
          <Card flush className="bg-ink-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Prompt{essay.promptSource ? ` · ${essay.promptSource}` : ''}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{essay.prompt}</p>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {essay.status ? <Badge tone={STATUS_META[essay.status].tone}>{STATUS_META[essay.status].label}</Badge> : null}
          <div className="flex items-center gap-2 text-xs">
            <span className={TONE_CLASS[tone]}>
              {count} words{targetNum ? ` / ${targetNum}` : ''}
            </span>
            <label className="text-ink-400">target</label>
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-16 rounded border border-ink-200 px-1.5 py-0.5 text-xs"
              aria-label="Target word count"
            />
          </div>
        </div>

        <Textarea
          rows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your essay here. Your drafts are versioned — save whenever you want a checkpoint."
          className="font-serif leading-relaxed"
        />

        {error ? <p className="text-sm text-error-700">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button icon="book" loading={savingDraft} disabled={!dirty} onClick={() => void saveDraft()}>
            {dirty ? 'Save draft' : 'Saved'}
          </Button>
          <Button variant="outline" icon="check" loading={reviewing} onClick={() => void runReview()} disabled={!content.trim()}>
            Check my essay
          </Button>
        </div>

        {feedback ? (
          <Card className="space-y-3">
            <h4 className="text-sm font-semibold text-ink-800">Feedback (your words, kept yours — no rewrite)</h4>
            {feedback.strengths.length ? (
              <div>
                <div className="text-xs font-medium text-success-700">Strengths</div>
                <ul className="list-inside list-disc text-sm text-ink-700">
                  {feedback.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {feedback.suggestions.length ? (
              <div>
                <div className="text-xs font-medium text-primary-700">Suggestions</div>
                <ul className="list-inside list-disc text-sm text-ink-700">
                  {feedback.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {feedback.authenticity ? <p className="text-sm text-ink-700"><span className="font-medium">Authenticity:</span> {feedback.authenticity}</p> : null}
            {feedback.structure ? <p className="text-sm text-ink-700"><span className="font-medium">Structure:</span> {feedback.structure}</p> : null}
            {!feedback.strengths.length && !feedback.suggestions.length && !feedback.authenticity && !feedback.structure ? (
              <p className="text-sm text-ink-500">No feedback came back — try again in a moment.</p>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* AI sidebar */}
      <aside className="space-y-3">
        <Card className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-800">Find relevant experiences</h4>
          <p className="text-xs text-ink-500">
            Pull from your journal, clinical hours, and Why Nursing entries — including your private
            ones (only you can see them here).
          </p>
          <Button variant="outline" size="sm" icon="search" block loading={findingExp} onClick={() => void runFindExperiences()}>
            Find experiences
          </Button>
          {findingExp ? <div className="flex justify-center py-2"><Spinner size={18} /></div> : null}
          {experiences.map((e) => (
            <div key={`${e.source}:${e.id}`} className="rounded-lg border border-ink-100 p-2">
              <div className="flex items-center gap-1.5">
                <Badge tone="neutral">{SOURCE_LABEL[e.source]}</Badge>
                <span className="truncate text-sm font-medium text-ink-800">{e.title}</span>
              </div>
              {e.why ? <p className="mt-1 text-xs text-ink-500">{e.why}</p> : null}
            </div>
          ))}
        </Card>

        {angles.length ? (
          <Card className="space-y-1">
            <h4 className="flex items-center gap-1 text-sm font-semibold text-ink-800">
              <Icon name="star" size={13} /> Suggested angles
            </h4>
            <ul className="list-inside list-disc text-sm text-ink-700">
              {angles.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        {history.length ? (
          <Card className="space-y-2">
            <h4 className="text-sm font-semibold text-ink-800">Version history</h4>
            {history.map((dr) => (
              <button
                key={dr.version}
                type="button"
                onClick={() => setContent(dr.content)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-ink-50"
              >
                <span className="text-ink-700">v{dr.version}</span>
                <span className="text-xs text-ink-400">{dr.wordCount ?? wordCount(dr.content)} words</span>
              </button>
            ))}
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner, Tabs, Textarea, type TabItem } from '../../shared/ui';
import { ApplicationOverview } from './ApplicationOverview';
import { EssayWorkspace } from './EssayWorkspace';
import { RecommendationBoard } from './RecommendationBoard';
import { TestScoreTracker } from './TestScoreTracker';
import { DecisionMatrix } from './DecisionMatrix';
import { ESSAY_STATUS_META, VERDICT_META, latestDraft } from './logic';
import { createEssay, listCollegeOptions, listEssays } from './api';
import type { CollegeOption, Essay } from './types';

type TabId = 'overview' | 'essays' | 'recommenders' | 'scores' | 'decisions';

/** Application Central — application tracker (overview) + the essay workspace (the killer feature).
 *  New essays can be linked to a roster college, which offers that school's real hydrated prompts
 *  as one-tap starting points and grounds every AI coach action in what that school looks for. */
export default function ApplicationCentralPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [essays, setEssays] = useState<Essay[]>([]);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Essay | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [creating, setCreating] = useState(false);

  const collegeName = useMemo(() => {
    const byId = new Map(colleges.map((c) => [c.collegeId, c.name]));
    return (id?: string) => (id ? byId.get(id) ?? id : undefined);
  }, [colleges]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEssays(await listEssays());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your essays.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    // The college roster powers the picker + name labels; the page works fine without it.
    void listCollegeOptions().then(setColleges).catch(() => setColleges([]));
  }, [load]);

  function onEssayChanged(updated: Essay) {
    setSelected(updated);
    setEssays((prev) => prev.map((e) => (e.essayId === updated.essayId ? updated : e)));
  }

  const suggestedPrompts = useMemo(
    () => colleges.find((c) => c.collegeId === collegeId)?.essayPrompts ?? [],
    [colleges, collegeId],
  );

  async function create() {
    setCreating(true);
    try {
      const e = await createEssay({
        prompt: prompt.trim() || undefined,
        collegeId: collegeId || undefined,
        promptSource: collegeId && suggestedPrompts.includes(prompt.trim()) ? 'college' : undefined,
      });
      setShowNew(false);
      setPrompt('');
      setCollegeId('');
      await load();
      setSelected(e);
    } finally {
      setCreating(false);
    }
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Applications' },
    { id: 'essays', label: 'Essays', count: essays.length },
    { id: 'recommenders', label: 'Recommenders' },
    { id: 'scores', label: 'Test scores' },
    { id: 'decisions', label: 'Decisions' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Application Central</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Track every application and write standout essays with an AI coach grounded in your real experiences.
        </p>
      </header>

      {selected ? (
        <EssayWorkspace essay={selected} collegeName={collegeName(selected.collegeId)} onChanged={onEssayChanged} onBack={() => setSelected(null)} />
      ) : (
        <>
          <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />
          {tab === 'overview' ? (
            <ApplicationOverview />
          ) : tab === 'recommenders' ? (
            <RecommendationBoard />
          ) : tab === 'scores' ? (
            <TestScoreTracker />
          ) : tab === 'decisions' ? (
            <DecisionMatrix />
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button icon="plus" onClick={() => setShowNew(true)}>New essay</Button>
              </div>
              {error ? (
                <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>
              ) : loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : essays.length === 0 ? (
                <EmptyState icon="application" title="No essays yet" description="Start an essay for a college prompt — then use the AI coach to find experiences, practice questions, and get a rated review." action={<Button icon="plus" onClick={() => setShowNew(true)}>Start an essay</Button>} />
              ) : (
                essays.map((e) => {
                  const meta = ESSAY_STATUS_META[e.status ?? 'brainstorming'];
                  const ld = latestDraft(e);
                  return (
                    <button key={e.essayId} type="button" onClick={() => setSelected(e)} className="block w-full rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken">
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
                        {e.collegeId ? `${collegeName(e.collegeId)} · ` : ''}{e.drafts?.length ?? 0} draft{(e.drafts?.length ?? 0) === 1 ? '' : 's'}{ld?.wordCount ? ` · ${ld.wordCount} words` : ''}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Start a new essay" size="lg">
        <div className="space-y-3">
          <Field label="College (optional)">
            <Select value={collegeId} onChange={(e) => setCollegeId(e.target.value)}>
              <option value="">No college — Common App / practice</option>
              {colleges.map((c) => (
                <option key={c.collegeId} value={c.collegeId}>{c.name}</option>
              ))}
            </Select>
          </Field>
          {suggestedPrompts.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">This school’s real prompts — tap to use</p>
              {suggestedPrompts.map((p, i) => (
                <button key={i} type="button" onClick={() => setPrompt(p)} className={`block w-full rounded-md border p-2 text-left text-sm ${prompt === p ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken'}`}>
                  {p}
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Prompt">
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Paste the essay prompt, or pick one above…" />
          </Field>
          <div className="flex gap-2">
            <Button loading={creating} onClick={() => void create()}>Create</Button>
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

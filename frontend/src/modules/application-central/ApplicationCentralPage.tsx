import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner, Tabs, Textarea, type TabItem } from '../../shared/ui';
import { ApplicationOverview } from './ApplicationOverview';
import { EssayWorkspace } from './EssayWorkspace';
import { RecommendationBoard } from './RecommendationBoard';
import { TestScoreTracker } from './TestScoreTracker';
import { DecisionMatrix } from './DecisionMatrix';
import { ESSAY_STATUS_META, latestDraft } from './logic';
import { createEssay, listEssays } from './api';
import type { Essay } from './types';

type TabId = 'overview' | 'essays' | 'recommenders' | 'scores' | 'decisions';

/** Application Central — application tracker (overview) + the essay workspace (the killer feature). */
export default function ApplicationCentralPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [essays, setEssays] = useState<Essay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Essay | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [creating, setCreating] = useState(false);

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
  }, [load]);

  function onEssayChanged(updated: Essay) {
    setSelected(updated);
    setEssays((prev) => prev.map((e) => (e.essayId === updated.essayId ? updated : e)));
  }

  async function create() {
    setCreating(true);
    try {
      const e = await createEssay({ prompt: prompt.trim() || undefined, collegeId: collegeId.trim() || undefined });
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
          Track every application and write standout essays with an AI partner grounded in your real experiences.
        </p>
      </header>

      {selected ? (
        <EssayWorkspace essay={selected} onChanged={onEssayChanged} onBack={() => setSelected(null)} />
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
                <EmptyState icon="application" title="No essays yet" description="Start an essay for a college prompt — then use the AI partner to find experiences and get feedback." action={<Button icon="plus" onClick={() => setShowNew(true)}>Start an essay</Button>} />
              ) : (
                essays.map((e) => {
                  const meta = ESSAY_STATUS_META[e.status ?? 'brainstorming'];
                  const ld = latestDraft(e);
                  return (
                    <button key={e.essayId} type="button" onClick={() => setSelected(e)} className="block w-full rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink-900">{e.prompt || 'Untitled essay'}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {e.collegeId ? `${e.collegeId} · ` : ''}{e.drafts?.length ?? 0} draft{(e.drafts?.length ?? 0) === 1 ? '' : 's'}{ld?.wordCount ? ` · ${ld.wordCount} words` : ''}
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
          <Field label="Prompt">
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Paste the college's essay prompt…" />
          </Field>
          <Field label="College (optional)">
            <Input value={collegeId} onChange={(e) => setCollegeId(e.target.value)} placeholder="college id or name" />
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

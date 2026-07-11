import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Spinner, Tabs, type TabItem } from '../../shared/ui';
import { ApplicationOverview } from './ApplicationOverview';
import { EssayCoachStart } from './EssayCoachStart';
import { EssayWorkspace } from './EssayWorkspace';
import { RecommendationBoard } from './RecommendationBoard';
import { TestScoreTracker } from './TestScoreTracker';
import { DecisionMatrix } from './DecisionMatrix';
import { ESSAY_STATUS_META, VERDICT_META, groupEssaysByCollege, latestDraft } from './logic';
import { listCollegeOptions, listEssays } from './api';
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

  const [starting, setStarting] = useState(false);
  const [startCollegeId, setStartCollegeId] = useState<string | undefined>(undefined);

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

  /** Display label for an attempt: roster name by id, else its typed name, else general practice. */
  const labelFor = useCallback(
    (e: Essay) =>
      e.collegeId ? collegeName(e.collegeId) ?? e.collegeName ?? e.collegeId : e.collegeName ?? 'General practice',
    [collegeName],
  );

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
        <EssayWorkspace
          essay={selected}
          collegeName={collegeName(selected.collegeId)}
          onChanged={onEssayChanged}
          onBack={() => setSelected(null)}
          onTryAnother={() => {
            setStartCollegeId(selected.collegeId);
            setSelected(null);
            setStarting(true);
          }}
        />
      ) : (
        <>
          <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />
          {tab === 'overview' ? (
            <ApplicationOverview
              onStartEssay={(cid) => {
                setTab('essays');
                setStartCollegeId(cid);
                setStarting(true);
              }}
              onViewEssays={() => setTab('essays')}
            />
          ) : tab === 'recommenders' ? (
            <RecommendationBoard />
          ) : tab === 'scores' ? (
            <TestScoreTracker />
          ) : tab === 'decisions' ? (
            <DecisionMatrix />
          ) : starting ? (
            <EssayCoachStart
              colleges={colleges}
              initialCollegeId={startCollegeId}
              onWrite={(e) => {
                setStarting(false);
                setSelected(e);
                void load();
              }}
              onCancel={() => setStarting(false)}
            />
          ) : (
            <div className="space-y-4">
              {error ? (
                <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>
              ) : loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : essays.length === 0 ? (
                <EmptyState
                  icon="application"
                  title="Practice makes a standout essay"
                  description="Pick a school and I’ll pull up the kinds of essay questions it asks. You write; I coach you and rate it — I never write it for you."
                  action={<Button onClick={() => setStarting(true)}>Start practicing</Button>}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-semibold text-ink-900">Your attempts</h2>
                    <Button size="sm" icon="plus" onClick={() => setStarting(true)}>Practice a new essay</Button>
                  </div>
                  {groupEssaysByCollege(essays, labelFor).map((group) => (
                    <div key={group.label} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{group.label}</p>
                      {group.essays.map((e) => {
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
                              {e.drafts?.length ?? 0} draft{(e.drafts?.length ?? 0) === 1 ? '' : 's'}{ld?.wordCount ? ` · ${ld.wordCount} words` : ''}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

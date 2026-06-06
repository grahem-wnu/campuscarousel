import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Spinner,
  Tabs,
  type TabItem,
} from '../../shared/ui';
import { ScoreChart } from './ScoreChart';
import { SectionBreakdown } from './SectionBreakdown';
import { RecordForm } from './RecordForm';
import { StudyPlanPanel } from './StudyPlanPanel';
import { TYPE_LABEL, trendLabel } from './logic';
import { analyze, createRecord, deleteRecord, getProgress, listRecords, updateRecord } from './api';
import type { Analysis, ProgressResponse, TeasInput, TeasRecord } from './types';

type TabId = 'scores' | 'plan' | 'sessions';

/** TEAS Prep Center — score tracker + progression chart, section breakdown, study plan, session log,
 *  and AI coaching ("Analyze my scores", "Am I ready?"). */
export default function TeasPage() {
  const [records, setRecords] = useState<TeasRecord[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('scores');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeasRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [recs, prog] = await Promise.all([listRecords(), getProgress()]);
      setRecords(recs);
      setProgress(prog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your TEAS data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const sessions = useMemo(() => records.filter((r) => r.type === 'study-session'), [records]);
  const attempts = useMemo(
    () => records.filter((r) => r.type !== 'study-session').slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [records],
  );

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setShowForm(true);
  }
  function openEdit(r: TeasRecord) {
    setEditing(r);
    setFormError(null);
    setShowForm(true);
  }

  async function submit(input: TeasInput) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) await updateRecord(editing.recordId, input);
      else await createRecord(input);
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Check the fields.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRecord() {
    if (!editing) return;
    setSubmitting(true);
    try {
      await deleteRecord(editing.recordId);
      setShowForm(false);
      setEditing(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function runAnalysis() {
    setShowAnalysis(true);
    setAnalyzing(true);
    try {
      setAnalysis(await analyze());
    } catch {
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  }

  const tabs: TabItem[] = [
    { id: 'scores', label: 'Scores', count: attempts.length },
    { id: 'plan', label: 'Study plan' },
    { id: 'sessions', label: 'Sessions', count: sessions.length },
  ];

  const readiness = progress?.readiness;
  const summary = progress?.summary;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">TEAS Prep</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Track practice scores, see your progression, and get an AI study plan for the nursing entrance exam.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon="chat" onClick={() => void runAnalysis()}>
            Analyze my scores
          </Button>
          <Button icon="plus" onClick={openCreate}>Log score</Button>
        </div>
      </header>

      {readiness && summary && summary.attempts > 0 ? (
        <Card className={readiness.ready ? 'border border-success-200 bg-success-50' : 'bg-surface-raised'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {readiness.ready ? '✅ On track' : '🎯 Keep going'} — {readiness.message}
              </p>
              <p className="text-xs text-ink-500">{trendLabel(summary.trend)} · {summary.cumulativeStudyHours}h studied</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-ink-900">{summary.latestOverall ?? '—'}</p>
              <p className="text-xs text-ink-500">best {summary.bestOverall ?? '—'}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : records.length === 0 ? (
        <EmptyState
          icon="teas"
          title="Start tracking your TEAS prep"
          description="Log your first practice test to see your score progression, a section-by-section breakdown, and a personalized study plan."
          action={<Button icon="plus" onClick={openCreate}>Log a practice score</Button>}
        />
      ) : tab === 'scores' ? (
        <div className="space-y-4">
          {progress && progress.progression.length > 0 ? (
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold text-ink-800">Overall progression</h2>
              <ScoreChart progression={progress.progression} />
              <h2 className="pt-2 text-sm font-semibold text-ink-800">Latest section breakdown</h2>
              <SectionBreakdown progression={progress.progression} />
            </Card>
          ) : (
            <p className="py-6 text-center text-sm text-ink-500">Log a practice test to chart your progression.</p>
          )}
          <div className="space-y-2">
            {attempts.map((r) => (
              <button
                key={r.recordId}
                type="button"
                onClick={() => openEdit(r)}
                className="flex w-full items-center justify-between rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken"
              >
                <span className="text-sm">
                  <span className="font-medium text-ink-900">{r.date}</span>
                  <Badge tone={r.type === 'official-exam' ? 'primary' : 'neutral'} className="ml-2">{TYPE_LABEL[r.type]}</Badge>
                </span>
                <span className="text-lg font-semibold text-ink-900">{r.overallScore ?? '—'}</span>
              </button>
            ))}
          </div>
        </div>
      ) : tab === 'plan' ? (
        <StudyPlanPanel />
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-ink-600">
            <span>Study sessions</span>
            <span>{summary?.cumulativeStudyHours ?? 0}h total</span>
          </div>
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">No study sessions logged yet.</p>
          ) : (
            sessions.map((r) => (
              <button
                key={r.recordId}
                type="button"
                onClick={() => openEdit(r)}
                className="flex w-full items-center justify-between rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken"
              >
                <span className="text-sm">
                  <span className="font-medium text-ink-900">{r.date}</span>
                  {r.studyTopics?.length ? <span className="ml-2 text-ink-500">{r.studyTopics.join(', ')}</span> : null}
                </span>
                <span className="text-sm text-ink-700">{r.studyDuration ?? 0}h</span>
              </button>
            ))
          )}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit record' : 'Log a TEAS record'} size="lg">
        <RecordForm
          initial={editing ?? undefined}
          busy={submitting}
          error={formError}
          onSubmit={(input) => void submit(input)}
          onCancel={() => setShowForm(false)}
          onDelete={editing ? () => void removeRecord() : undefined}
        />
      </Modal>

      <Modal open={showAnalysis} onClose={() => setShowAnalysis(false)} title="Score analysis">
        {analyzing ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : analysis ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm text-ink-800">{analysis.summary}</p>
              {analysis.source === 'curated' ? <Badge tone="neutral">offline</Badge> : <Badge tone="primary">AI</Badge>}
            </div>
            <p className="text-sm font-medium text-ink-700">{analysis.readiness}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">
              {analysis.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No analysis available.</p>
        )}
      </Modal>
    </div>
  );
}

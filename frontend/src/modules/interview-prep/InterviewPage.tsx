import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Modal, Spinner, Tabs, type TabItem } from '../../shared/ui';
import { MockInterview } from './MockInterview';
import { QuestionBankView } from './QuestionBankView';
import { RealLogForm } from './RealLogForm';
import { historyStats, ratingTone } from './logic';
import { createInterview, deleteInterview, listInterviews, updateInterview } from './api';
import type { Interview, InterviewInput } from './types';

type TabId = 'practice' | 'history' | 'bank' | 'log';

/** Interview Prep — AI mock practice, history/progress, question bank, and a real-interview log. */
export default function InterviewPage() {
  const [sessions, setSessions] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('practice');

  const [showLog, setShowLog] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await listInterviews());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your interview prep.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const stats = useMemo(() => historyStats(sessions), [sessions]);
  const realLogs = useMemo(
    () => sessions.filter((s) => s.type === 'real-interview').slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [sessions],
  );

  async function submitLog(input: InterviewInput) {
    setSaving(true);
    try {
      if (editing) await updateInterview(editing.sessionId, input);
      else await createInterview(input);
      setShowLog(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeLog() {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteInterview(editing.sessionId);
      setShowLog(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const tabs: TabItem[] = [
    { id: 'practice', label: 'Practice' },
    { id: 'history', label: 'History', count: stats.answered },
    { id: 'bank', label: 'Question bank' },
    { id: 'log', label: 'Real interviews', count: realLogs.length },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Interview Prep</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Practice admissions interviews with an AI coach that grounds feedback in your real experiences.
        </p>
      </header>

      {stats.answered > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-900">
              Avg rating <Badge tone={ratingTone(stats.avgRating ?? undefined)}>{stats.avgRating ?? '—'}/5</Badge>
            </p>
            <p className="text-xs text-ink-500">{stats.answered} answers across {stats.sessions} mock{stats.sessions === 1 ? '' : 's'}</p>
          </div>
          {stats.weakest ? (
            <p className="max-w-xs text-right text-xs text-ink-500">
              Keep practicing: “{stats.weakest.question}” ({stats.weakest.rating}/5)
            </p>
          ) : null}
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
      ) : tab === 'practice' ? (
        <MockInterview onSessionChanged={() => void load()} />
      ) : tab === 'history' ? (
        stats.answered === 0 ? (
          <EmptyState icon="interview" title="No mock answers yet" description="Run a mock interview to start building a track record of ratings and see where to focus." action={<Button onClick={() => setTab('practice')}>Start a mock</Button>} />
        ) : (
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-800">Rating over time</h2>
            <div className="flex items-end gap-1.5">
              {stats.trend.map((t, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-primary-400" style={{ height: `${t.avg * 18}px` }} title={`${t.date}: ${t.avg}/5`} />
                  <span className="text-[10px] text-ink-400">{t.date.slice(5)}</span>
                </div>
              ))}
            </div>
            {stats.strongest ? (
              <p className="text-sm text-ink-600">💪 Strongest: “{stats.strongest.question}” ({stats.strongest.rating}/5)</p>
            ) : null}
            {stats.weakest ? (
              <p className="text-sm text-ink-600">🎯 Focus: “{stats.weakest.question}” ({stats.weakest.rating}/5)</p>
            ) : null}
          </Card>
        )
      ) : tab === 'bank' ? (
        <QuestionBankView />
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button icon="plus" onClick={() => { setEditing(null); setShowLog(true); }}>Log a real interview</Button>
          </div>
          {realLogs.length === 0 ? (
            <EmptyState icon="interview" title="No real interviews logged" description="After an actual interview, log how it went, the questions asked, and your thank-you follow-up." />
          ) : (
            realLogs.map((r) => (
              <button key={r.sessionId} type="button" onClick={() => { setEditing(r); setShowLog(true); }} className="block w-full rounded-md bg-surface-raised p-3 text-left shadow-sm hover:bg-surface-sunken">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-900">{r.date}{r.collegeId ? ` · ${r.collegeId}` : ''}</span>
                  {r.confidenceLevel ? <Badge tone={ratingTone(r.confidenceLevel)}>confidence {r.confidenceLevel}/5</Badge> : null}
                </div>
                {r.overallNotes ? <p className="mt-1 line-clamp-2 text-sm text-ink-600">{r.overallNotes}</p> : null}
              </button>
            ))
          )}
        </div>
      )}

      <Modal open={showLog} onClose={() => setShowLog(false)} title={editing ? 'Edit interview log' : 'Log a real interview'} size="lg">
        <RealLogForm
          initial={editing ?? undefined}
          busy={saving}
          onSubmit={(input) => void submitLog(input)}
          onCancel={() => setShowLog(false)}
          onDelete={editing ? () => void removeLog() : undefined}
        />
      </Modal>
    </div>
  );
}

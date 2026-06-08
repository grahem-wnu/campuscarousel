import { useEffect, useState } from 'react';
import { Badge, Button, Card, DateField, EmptyState, Field, Input, Select, Spinner, Table, useToast, type Column } from '../../shared/ui';
import { createTestScore, deleteTestScore, listTestScores, updateTestScore } from './api';
import { TEST_SCORE_TYPES, type TestScore, type TestScoreType } from './types';

/** Test-score tracker — SAT/ACT/TEAS/AP records and which schools each score has been sent to. */
export function TestScoreTracker() {
  const toast = useToast();
  const [scores, setScores] = useState<TestScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testType, setTestType] = useState<TestScoreType>('SAT');
  const [score, setScore] = useState('');
  const [testDate, setTestDate] = useState('');
  const [apSubject, setApSubject] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    setError(null);
    try {
      setScores(await listTestScores());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load test scores.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const n = score.trim() === '' ? undefined : Number(score);
    if (n !== undefined && Number.isNaN(n)) {
      toast.show('Score must be a number.', 'error');
      return;
    }
    setAdding(true);
    try {
      await createTestScore({
        testType,
        score: n,
        testDate: testDate || undefined,
        apSubject: testType === 'AP' && apSubject.trim() ? apSubject.trim() : undefined,
      });
      setScore('');
      setTestDate('');
      setApSubject('');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not add score.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function editSentTo(s: TestScore) {
    const next = window.prompt('Schools this score was sent to (comma-separated college ids):', (s.sentTo ?? []).join(', '));
    if (next === null) return;
    const sentTo = next.split(',').map((x) => x.trim()).filter(Boolean);
    const updated = await updateTestScore(s.scoreId, { sentTo });
    setScores((prev) => prev.map((x) => (x.scoreId === updated.scoreId ? updated : x)));
  }

  async function remove(s: TestScore) {
    await deleteTestScore(s.scoreId);
    setScores((prev) => prev.filter((x) => x.scoreId !== s.scoreId));
  }

  const columns: Column<TestScore>[] = [
    { key: 'type', header: 'Test', render: (s) => <span className="font-medium text-ink-900">{s.testType}{s.apSubject ? `: ${s.apSubject}` : ''}</span> },
    { key: 'score', header: 'Score', align: 'right', render: (s) => (s.score ?? '—') },
    { key: 'date', header: 'Date', render: (s) => s.testDate ?? '—' },
    {
      key: 'sent',
      header: 'Sent to',
      render: (s) => (s.sentTo?.length ? <Badge tone="info">{s.sentTo.length} school{s.sentTo.length === 1 ? '' : 's'}</Badge> : <span className="text-ink-400">—</span>),
    },
    {
      key: 'actions',
      header: '',
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => void editSentTo(s)}>Send to…</Button>
          <Button size="sm" variant="ghost" icon="close" onClick={() => void remove(s)} aria-label="Delete score" />
        </div>
      ),
    },
  ];

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
          <Field label="Test">
            <Select value={testType} onChange={(e) => setTestType(e.target.value as TestScoreType)}>
              {TEST_SCORE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label={testType === 'AP' ? 'AP score (1–5)' : 'Score'}>
            <Input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} placeholder={testType === 'SAT' ? '1380' : ''} />
          </Field>
          {testType === 'AP' ? (
            <Field label="AP subject">
              <Input value={apSubject} onChange={(e) => setApSubject(e.target.value)} placeholder="Biology" />
            </Field>
          ) : (
            <DateField label="Date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          )}
          <Button icon="plus" loading={adding} onClick={() => void add()}>Add</Button>
        </div>
      </Card>

      {scores.length === 0 ? (
        <EmptyState icon="teas" title="No test scores yet" description="Track SAT, ACT, TEAS, and AP scores — and record which schools each was sent to." />
      ) : (
        <Table columns={columns} rows={scores} rowKey={(s) => s.scoreId} />
      )}
    </div>
  );
}

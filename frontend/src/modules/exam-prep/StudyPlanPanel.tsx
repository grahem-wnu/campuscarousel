import { useState } from 'react';
import { Badge, Button, Card, DateField, Field, Input, Spinner } from '../../shared/ui';
import { getStudyPlan } from './api';
import type { StudyPlan } from './types';

/** Generate + display an AI study plan keyed to weak areas, exam date, and a target score. */
export function StudyPlanPanel() {
  const [examDate, setExamDate] = useState('');
  const [target, setTarget] = useState('78');
  const [hours, setHours] = useState('8');
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const p = await getStudyPlan({
        examDate: examDate || undefined,
        targetScore: target ? Number(target) : undefined,
        hoursPerWeek: hours ? Number(hours) : undefined,
      });
      setPlan(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build a plan. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateField label="Exam date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        <Field label="Target score">
          <Input type="number" min="0" max="100" value={target} onChange={(e) => setTarget(e.target.value)} className="w-24" />
        </Field>
        <Field label="Hours / week">
          <Input type="number" min="1" max="40" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" />
        </Field>
        <Button icon="teas" loading={loading} onClick={() => void generate()}>
          {plan ? 'Rebuild plan' : 'Build my plan'}
        </Button>
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : plan ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm text-ink-700">{plan.summary}</p>
            {plan.source === 'curated' ? <Badge tone="neutral">offline plan</Badge> : <Badge tone="primary">AI</Badge>}
          </div>
          {plan.focusAreas.length ? (
            <p className="text-xs text-ink-500">Focus: {plan.focusAreas.join(' · ')}</p>
          ) : null}
          <ol className="space-y-2">
            {plan.weeks.map((w) => (
              <li key={w.week} className="rounded-md bg-surface-sunken p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-800">Week {w.week}</span>
                  <span className="text-xs text-ink-500">{w.hours}h</span>
                </div>
                <p className="mt-0.5 text-ink-700">{w.focus.join(', ')}</p>
                {w.practice ? <p className="mt-0.5 text-xs text-ink-500">{w.practice}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-ink-500">
          Set your exam date and target, then build a week-by-week plan focused on your weak sections.
        </p>
      )}
    </Card>
  );
}

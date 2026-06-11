import { useState } from 'react';
import { Badge, Button, Card, Field, Input, Spinner } from '../../shared/ui';
import { createGoal, suggestGoals } from './api';
import { CATEGORY_META } from './logic';
import type { GoalInput, SuggestedGoal } from './types';

interface SuggestGoalsProps {
  /** Called after the user saves accepted suggestions, so the page can refresh. */
  onSaved: (createdCount: number) => void;
  onCancel: () => void;
}

interface Draft extends SuggestedGoal {
  include: boolean;
}

/** AI suggest flow: gather a little profile context → fetch suggestions → let the user check off,
 *  edit the title of, or drop each one → save the accepted set as real goals. Nothing is persisted
 *  until the user clicks Save (spec: "returns suggestions, not auto-saved"). */
export function SuggestGoals({ onSaved, onCancel }: SuggestGoalsProps) {
  const [gradeLevel, setGradeLevel] = useState('');
  const [careerGoal, setCareerGoal] = useState('');
  const [period, setPeriod] = useState('');
  const [phase, setPhase] = useState<'form' | 'loading' | 'review'>('form');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchSuggestions(e: React.FormEvent) {
    e.preventDefault();
    setPhase('loading');
    setError(null);
    try {
      const suggestions = await suggestGoals({
        gradeLevel: gradeLevel.trim() || undefined,
        careerGoal: careerGoal.trim() || undefined,
        period: period.trim() || undefined,
      });
      setDrafts(suggestions.map((s) => ({ ...s, include: true })));
      setPhase('review');
      if (suggestions.length === 0) setError('No suggestions came back. Try adding more context, or add a goal manually.');
    } catch (err) {
      setPhase('form');
      setError(err instanceof Error ? err.message : 'Could not get suggestions right now.');
    }
  }

  function patchDraft(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function saveSelected() {
    const chosen = drafts.filter((d) => d.include && d.title.trim());
    if (chosen.length === 0) {
      setError('Check at least one suggestion to save.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const d of chosen) {
        const input: GoalInput = { title: d.title.trim(), status: 'not-started' };
        if (d.description) input.description = d.description;
        if (d.category) input.category = d.category;
        if (period.trim() || d.period) input.period = (period.trim() || d.period)!;
        if (d.milestones?.length) input.milestones = d.milestones.map((label) => ({ label }));
        await createGoal(input);
      }
      onSaved(chosen.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the goals.');
      setSaving(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-ink-500">
        <Spinner />
        Thinking through goals for your plan…
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          Edit, uncheck, or keep these. Nothing is saved until you click <strong>Save selected</strong>.
        </p>
        {error ? <p className="text-sm text-error-700">{error}</p> : null}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {drafts.map((d, i) => (
            <Card key={i} flush className="flex gap-3 p-3">
              <input
                type="checkbox"
                checked={d.include}
                onChange={(e) => patchDraft(i, { include: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-ink-300 text-primary-600"
                aria-label={`Include ${d.title}`}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input value={d.title} onChange={(e) => patchDraft(i, { title: e.target.value })} />
                {d.description ? <p className="text-xs text-ink-500">{d.description}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  {d.category ? <Badge tone="neutral">{CATEGORY_META[d.category].label}</Badge> : null}
                  {d.milestones?.length ? (
                    <Badge tone="info">
                      {d.milestones.length} milestone{d.milestones.length === 1 ? '' : 's'}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setPhase('form')} disabled={saving}>
            Back
          </Button>
          <Button loading={saving} onClick={() => void saveSelected()}>
            Save selected
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={fetchSuggestions} className="space-y-4">
      <p className="text-sm text-ink-600">
        Tell us a little about where you are, and we&apos;ll suggest year-by-year goals you can edit before saving.
      </p>
      <Field label="Grade level" hint="e.g. Junior, Sophomore">
        <Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="Junior" />
      </Field>
      <Field label="Career goal">
        <Input value={careerGoal} onChange={(e) => setCareerGoal(e.target.value)} placeholder="e.g. Biology, Pre-med" />
      </Field>
      <Field label="Plan for (period)" hint="Optional — applies to every saved goal">
        <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Junior Year" />
      </Field>
      {error ? <p className="text-sm text-error-700">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" icon="star">
          Suggest goals
        </Button>
      </div>
    </form>
  );
}

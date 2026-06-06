import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '../../shared/ui';
import { CATEGORY_META } from './logic';
import { CATEGORIES, STATUSES, type Category, type GoalInput, type Status } from './types';
import { STATUS_META } from './logic';

interface MilestoneDraft {
  id?: string;
  label: string;
  completed?: boolean;
  completedDate?: string;
}

export interface GoalFormValues {
  title: string;
  description: string;
  category: Category | '';
  period: string;
  targetDate: string;
  status: Status;
  progress: string; // text in the input; coerced on submit
  milestones: MilestoneDraft[];
}

export function emptyForm(over: Partial<GoalFormValues> = {}): GoalFormValues {
  return {
    title: '',
    description: '',
    category: '',
    period: '',
    targetDate: '',
    status: 'not-started',
    progress: '',
    milestones: [],
    ...over,
  };
}

/** Build the create/update payload from the form, dropping empty optionals. */
export function toInput(v: GoalFormValues): GoalInput {
  const input: GoalInput = { title: v.title.trim(), status: v.status };
  if (v.description.trim()) input.description = v.description.trim();
  if (v.category) input.category = v.category;
  if (v.period.trim()) input.period = v.period.trim();
  if (v.targetDate) input.targetDate = v.targetDate;
  const hasMilestones = v.milestones.some((m) => m.label.trim());
  if (hasMilestones) {
    input.milestones = v.milestones
      .filter((m) => m.label.trim())
      .map((m) => ({
        id: m.id,
        label: m.label.trim(),
        completed: m.completed ?? false,
        // Keep an existing completion date so editing the goal doesn't re-stamp it to today.
        ...(m.completed && m.completedDate ? { completedDate: m.completedDate } : {}),
      }));
  } else if (v.progress.trim() !== '') {
    // Manual progress only applies when there are no milestones (which drive progress automatically).
    const n = Number(v.progress);
    if (Number.isFinite(n)) input.progress = Math.max(0, Math.min(100, Math.round(n)));
  }
  return input;
}

interface GoalFormProps {
  initial?: GoalFormValues;
  submitLabel?: string;
  onSubmit: (input: GoalInput) => Promise<void> | void;
  onCancel: () => void;
}

/** Create/edit form. Drives both "New goal" and editing an existing goal's detail. */
export function GoalForm({ initial, submitLabel = 'Save goal', onSubmit, onCancel }: GoalFormProps) {
  const [v, setV] = useState<GoalFormValues>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const hasMilestones = v.milestones.length > 0;

  function setMilestone(i: number, patch: Partial<MilestoneDraft>) {
    setV((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) {
      setError('Give your goal a title.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(toInput(v));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the goal.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" required>
        <Input
          autoFocus
          value={v.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Earn a CNA certification"
        />
      </Field>

      <Field label="Description">
        <Textarea
          rows={3}
          value={v.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What does success look like? Why does it matter?"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={v.category} onChange={(e) => set('category', e.target.value as Category | '')}>
            <option value="">Uncategorized</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="School year / period">
          <Input
            value={v.period}
            onChange={(e) => set('period', e.target.value)}
            placeholder="e.g. Junior Year"
          />
        </Field>
        <Field label="Target date">
          <Input type="date" value={v.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
        </Field>
      </div>

      {!hasMilestones ? (
        <Field label="Progress (%)" hint="Used until you add milestones, which then drive progress automatically.">
          <Input
            type="number"
            min={0}
            max={100}
            value={v.progress}
            onChange={(e) => set('progress', e.target.value)}
            placeholder="0"
          />
        </Field>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-700">Milestones</legend>
        {hasMilestones ? (
          <p className="text-xs text-ink-500">Progress is the share of milestones checked off.</p>
        ) : null}
        {v.milestones.map((m, i) => (
          <div key={m.id ?? i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={m.completed ?? false}
              onChange={(e) => setMilestone(i, { completed: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-primary-600"
              aria-label="Completed"
            />
            <Input
              value={m.label}
              onChange={(e) => setMilestone(i, { label: e.target.value })}
              placeholder="Milestone"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="close"
              aria-label="Remove milestone"
              onClick={() =>
                setV((prev) => ({ ...prev, milestones: prev.milestones.filter((_, idx) => idx !== i) }))
              }
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon="plus"
          onClick={() => setV((prev) => ({ ...prev, milestones: [...prev.milestones, { label: '' }] }))}
        >
          Add milestone
        </Button>
      </fieldset>

      {error ? <p className="text-sm text-error-700">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '../../shared/ui';
import { STATUS_META } from './logic';
import { ESSAY_STATUSES, type EssayInput, type EssayStatus } from './types';

export interface EssayFormValues {
  prompt: string;
  promptSource: string;
  collegeId: string;
  status: EssayStatus;
  notes: string;
}

export function emptyForm(over: Partial<EssayFormValues> = {}): EssayFormValues {
  return { prompt: '', promptSource: '', collegeId: '', status: 'brainstorming', notes: '', ...over };
}

export function toInput(v: EssayFormValues): EssayInput {
  const input: EssayInput = { status: v.status };
  if (v.prompt.trim()) input.prompt = v.prompt.trim();
  if (v.promptSource.trim()) input.promptSource = v.promptSource.trim();
  if (v.collegeId.trim()) input.collegeId = v.collegeId.trim();
  if (v.notes.trim()) input.notes = v.notes.trim();
  return input;
}

interface Props {
  initial?: EssayFormValues;
  submitLabel?: string;
  onSubmit: (input: EssayInput) => Promise<void> | void;
  onCancel: () => void;
}

export function EssayForm({ initial, submitLabel = 'Create essay', onSubmit, onCancel }: Props) {
  const [v, setV] = useState<EssayFormValues>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EssayFormValues>(k: K, val: EssayFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(toInput(v));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Essay prompt">
        <Textarea autoFocus rows={3} value={v.prompt} onChange={(e) => set('prompt', e.target.value)} placeholder="Paste the application prompt…" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Prompt source" hint="e.g. Common App, OSU supplement">
          <Input value={v.promptSource} onChange={(e) => set('promptSource', e.target.value)} />
        </Field>
        <Field label="College" hint="College id (optional)">
          <Input value={v.collegeId} onChange={(e) => set('collegeId', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as EssayStatus)}>
            {ESSAY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
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

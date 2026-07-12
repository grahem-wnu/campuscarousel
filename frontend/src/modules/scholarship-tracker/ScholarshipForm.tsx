import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '../../shared/ui';
import { TYPE_META, STATUS_META } from './logic';
import { STATUSES, TYPES, type ScholarshipInput, type ScholarshipType, type Status } from './types';

export interface ScholarshipFormValues {
  name: string;
  provider: string;
  amount: string;
  amountDescription: string;
  type: ScholarshipType | '';
  status: Status;
  applicationDeadline: string;
  applicationUrl: string;
  eligibility: string; // one per line
  requiredMaterials: string; // one per line
  notes: string;
}

const lines = (s: string): string[] =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function emptyForm(over: Partial<ScholarshipFormValues> = {}): ScholarshipFormValues {
  return {
    name: '',
    provider: '',
    amount: '',
    amountDescription: '',
    type: '',
    status: 'discovered',
    applicationDeadline: '',
    applicationUrl: '',
    eligibility: '',
    requiredMaterials: '',
    notes: '',
    ...over,
  };
}

export function toInput(v: ScholarshipFormValues): ScholarshipInput {
  const input: ScholarshipInput = { name: v.name.trim(), status: v.status };
  if (v.provider.trim()) input.provider = v.provider.trim();
  if (v.amount.trim() !== '') {
    const n = Number(v.amount);
    if (Number.isFinite(n) && n >= 0) input.amount = Math.round(n);
  }
  if (v.amountDescription.trim()) input.amountDescription = v.amountDescription.trim();
  if (v.type) input.type = v.type;
  if (v.applicationDeadline) input.applicationDeadline = v.applicationDeadline;
  if (v.applicationUrl.trim()) input.applicationUrl = v.applicationUrl.trim();
  if (lines(v.eligibility).length) input.eligibility = lines(v.eligibility);
  if (lines(v.requiredMaterials).length) input.requiredMaterials = lines(v.requiredMaterials);
  if (v.notes.trim()) input.notes = v.notes.trim();
  return input;
}

interface Props {
  initial?: ScholarshipFormValues;
  submitLabel?: string;
  onSubmit: (input: ScholarshipInput) => Promise<void> | void;
  onCancel: () => void;
}

export function ScholarshipForm({ initial, submitLabel = 'Save scholarship', onSubmit, onCancel }: Props) {
  const [v, setV] = useState<ScholarshipFormValues>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ScholarshipFormValues>(k: K, val: ScholarshipFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) {
      setError('Give the scholarship a name.');
      return;
    }
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
      <Field label="Name" required>
        <Input autoFocus value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. National Merit Scholarship" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <Input value={v.provider} onChange={(e) => set('provider', e.target.value)} placeholder="e.g. a foundation or professional association" />
        </Field>
        <Field label="Type">
          <Select value={v.type} onChange={(e) => set('type', e.target.value as ScholarshipType | '')}>
            <option value="">Unspecified</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount ($)">
          <Input type="number" min={0} value={v.amount} onChange={(e) => set('amount', e.target.value)} placeholder="5000" />
        </Field>
        <Field label="Amount note" hint="If the amount varies">
          <Input value={v.amountDescription} onChange={(e) => set('amountDescription', e.target.value)} placeholder="Up to full tuition" />
        </Field>
        <Field label="Deadline">
          <Input type="date" value={v.applicationDeadline} onChange={(e) => set('applicationDeadline', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as Status)}>
            {STATUSES.map((sv) => (
              <option key={sv} value={sv}>
                {STATUS_META[sv].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Application URL">
        <Input type="url" value={v.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Eligibility" hint="One per line">
        <Textarea rows={2} value={v.eligibility} onChange={(e) => set('eligibility', e.target.value)} />
      </Field>
      <Field label="Required materials" hint="One per line — becomes your application checklist">
        <Textarea rows={3} value={v.requiredMaterials} onChange={(e) => set('requiredMaterials', e.target.value)} />
      </Field>
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

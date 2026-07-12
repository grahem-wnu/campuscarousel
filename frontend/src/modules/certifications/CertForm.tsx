import { useState, type FormEvent } from 'react';
import { Button, DateField, Field, Input, Select, Textarea } from '../../shared/ui';
import { STATUS_META, WRITABLE_STATUS_OPTIONS } from './logic';
import type { Certification, CertificationInput, CertStatus } from './types';

interface Props {
  /** When editing, the cert to prefill from; omit to create. */
  initial?: Certification;
  busy?: boolean;
  error?: string | null;
  onSubmit: (input: CertificationInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const numOrUndef = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Create/edit form for a certification. Pure controlled inputs; validation mirrors the server
 *  (the API is the source of truth and will 422 on anything malformed). */
export function CertForm({ initial, busy, error, onSubmit, onCancel, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [issuer, setIssuer] = useState(initial?.issuingOrganization ?? '');
  const [number, setNumber] = useState(initial?.certificationNumber ?? '');
  const [status, setStatus] = useState<CertStatus>(initial?.status ?? 'planned');
  const [dateEarned, setDateEarned] = useState(initial?.dateEarned ?? '');
  const [expirationDate, setExpirationDate] = useState(initial?.expirationDate ?? '');
  const [renewalRequired, setRenewalRequired] = useState(initial?.renewalRequired ?? false);
  const [renewalFrequency, setRenewalFrequency] = useState(initial?.renewalFrequency ?? '');
  const [renewalRequirements, setRenewalRequirements] = useState(initial?.renewalRequirements ?? '');
  const [trainingProgram, setTrainingProgram] = useState(initial?.trainingProgram ?? '');
  const [trainingHours, setTrainingHours] = useState(
    initial?.trainingHours !== undefined ? String(initial.trainingHours) : '',
  );
  const [cost, setCost] = useState(initial?.cost !== undefined ? String(initial.cost) : '');
  const [documentUrl, setDocumentUrl] = useState(initial?.documentUrl ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      issuingOrganization: issuer.trim() || undefined,
      certificationNumber: number.trim() || undefined,
      status,
      dateEarned: dateEarned || undefined,
      expirationDate: expirationDate ? expirationDate : null,
      renewalRequired,
      renewalFrequency: renewalFrequency.trim() || undefined,
      renewalRequirements: renewalRequirements.trim() || undefined,
      trainingProgram: trainingProgram.trim() || undefined,
      trainingHours: numOrUndef(trainingHours),
      cost: numOrUndef(cost),
      documentUrl: documentUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. the certification name" required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Issuing organization">
          <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="American Heart Association" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as CertStatus)}>
            {WRITABLE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <DateField label="Date earned" value={dateEarned} onChange={(e) => setDateEarned(e.target.value)} />
        <DateField
          label="Expiration date"
          value={expirationDate ?? ''}
          onChange={(e) => setExpirationDate(e.target.value)}
        />
        <Field label="Certification #">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Cost (USD)">
          <Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={renewalRequired}
          onChange={(e) => setRenewalRequired(e.target.checked)}
          className="h-4 w-4 rounded border-surface-border text-primary-600"
        />
        Renewal required
      </label>

      {renewalRequired ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Renewal frequency">
            <Input
              value={renewalFrequency}
              onChange={(e) => setRenewalFrequency(e.target.value)}
              placeholder="Every 2 years"
            />
          </Field>
          <Field label="Renewal requirements" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={renewalRequirements}
              onChange={(e) => setRenewalRequirements(e.target.value)}
              placeholder="What's needed to renew (CEUs, retest, fee…)"
            />
          </Field>
        </div>
      ) : null}

      {status === 'in-progress' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Training program">
            <Input value={trainingProgram} onChange={(e) => setTrainingProgram(e.target.value)} />
          </Field>
          <Field label="Training hours logged">
            <Input type="number" min="0" value={trainingHours} onChange={(e) => setTrainingHours(e.target.value)} />
          </Field>
        </div>
      ) : null}

      <Field label="Certificate URL" hint="Link to a scan or the issuer's verification page.">
        <Input
          type="url"
          value={documentUrl}
          onChange={(e) => setDocumentUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>

      <Field label="Notes">
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          {initial ? 'Save changes' : 'Add certification'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {initial && onDelete ? (
          <Button type="button" variant="danger" className="ml-auto" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

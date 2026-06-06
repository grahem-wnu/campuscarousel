import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '../../shared/ui';
import { PROGRAM_TYPE_LABEL, SELECTABLE_STATUSES, STATUS_META } from './logic';
import { PROGRAM_TYPES, type College, type CollegeInput, type CollegeStatus, type ProgramType } from './types';

interface Props {
  initial?: College;
  busy?: boolean;
  error?: string | null;
  /** Shown only on create — explains the auto-hydrate behaviour. */
  createHint?: boolean;
  onSubmit: (input: CollegeInput) => void;
  onCancel: () => void;
}

const numOrUndef = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Create/edit a college. On create, just a name is enough — the server auto-hydrates the rest. */
export function CollegeForm({ initial, busy, error, createHint, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [state, setState] = useState(initial?.state ?? '');
  const [status, setStatus] = useState<CollegeStatus>(initial?.status ?? 'researching');
  const [programType, setProgramType] = useState<ProgramType | ''>(initial?.programType ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [ranking, setRanking] = useState(initial?.ranking ?? '');
  const [tuitionOut, setTuitionOut] = useState(
    initial?.tuitionOutOfState !== undefined ? String(initial.tuitionOutOfState) : '',
  );
  const [costAfterAid, setCostAfterAid] = useState(
    initial?.estimatedCostAfterAid !== undefined ? String(initial.estimatedCostAfterAid) : '',
  );
  const [specialNotes, setSpecialNotes] = useState(initial?.specialNotes ?? '');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      state: state.trim() || undefined,
      status,
      programType: programType || undefined,
      website: website.trim() || undefined,
      ranking: ranking.trim() || undefined,
      tuitionOutOfState: numOrUndef(tuitionOut),
      estimatedCostAfterAid: numOrUndef(costAfterAid),
      specialNotes: specialNotes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="College name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ohio State University" required />
      </Field>

      {createHint ? (
        <p className="rounded-md bg-primary-50 p-2 text-xs text-primary-700">
          Just the name is enough — we’ll auto-fill program details, tuition, deadlines, and branding for you.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="State">
          <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Ohio" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as CollegeStatus)}>
            {SELECTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Program type">
          <Select value={programType} onChange={(e) => setProgramType(e.target.value as ProgramType | '')}>
            <option value="">Unknown</option>
            {PROGRAM_TYPES.map((p) => (
              <option key={p} value={p}>
                {PROGRAM_TYPE_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Ranking">
          <Input value={ranking} onChange={(e) => setRanking(e.target.value)} placeholder="e.g. #42 nursing" />
        </Field>
        <Field label="Out-of-state tuition / yr">
          <Input type="number" min="0" value={tuitionOut} onChange={(e) => setTuitionOut(e.target.value)} />
        </Field>
        <Field label="Est. net cost / yr">
          <Input type="number" min="0" value={costAfterAid} onChange={(e) => setCostAfterAid(e.target.value)} />
        </Field>
      </div>

      <Field label="Notes">
        <Input value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} />
      </Field>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          {initial ? 'Save changes' : 'Add college'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
